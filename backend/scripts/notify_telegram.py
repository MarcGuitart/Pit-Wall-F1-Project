"""
Send the outcome of an autopublish run to Telegram. Called by the workflow.

    REPORT='{"published":[...]}' python scripts/notify_telegram.py
    python scripts/notify_telegram.py --report backend/report.json

Reads the report from $REPORT or --report, and the bot credentials from
$TELEGRAM_BOT_TOKEN and $TELEGRAM_CHAT_ID. With no credentials it prints the
message it would have sent and exits 0 — a missing notification must never fail
a run that published correctly.

It never exits non-zero for a Telegram problem, for the same reason. The
publication is the thing that matters; this is a courtesy.

Getting the two secrets (both are needed, the token alone is not enough):

  TELEGRAM_BOT_TOKEN
    Open Telegram, message @BotFather, send /newbot, answer the two questions.
    It replies with a token like 8123456789:AAF... — that is the whole value.

  TELEGRAM_CHAT_ID
    The bot cannot start a conversation, so you must speak to it first:
      1. open the t.me/<yourbot> link BotFather gave you and press Start,
      2. send it any message ("hi"),
      3. open this URL in a browser, with your token in place of <TOKEN>:
           https://api.telegram.org/bot<TOKEN>/getUpdates
      4. read result[0].message.chat.id — a number like 123456789 for a private
         chat, or a negative one like -1001234567890 for a group.
    If getUpdates returns {"ok":true,"result":[]} you have not sent the message
    yet, or something has already consumed the update; send another one.
    For a group, add the bot to it and send a message there instead — the
    negative id is the group.

  Then add both as repository secrets: Settings → Secrets and variables →
  Actions → New repository secret. Never in the repo.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.telegram.org"
CHAOS_EMOJI = {"Low": "🟢", "Medium": "🟡", "High": "🟠", "Extreme": "🔴"}


def esc(text: object) -> str:
    """HTML-escape, since the message is sent with parse_mode=HTML."""
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def published_lines(report: dict) -> list[str]:
    lines: list[str] = []
    for p in report.get("published") or []:
        name = p.get("meeting_name") or p.get("label") or p.get("session_key")
        session = p.get("session_name")
        title = f"{name} {p['year']}" if p.get("year") else str(name)
        if session and session != "Race":
            title += f" · {session}"
        lines.append(f"🏁 <b>{esc(title)}</b>")
        if p.get("winner"):
            grid = f" (from P{p['winner_grid']})" if p.get("winner_grid") else ""
            lines.append(f"   Winner: <b>{esc(p['winner'])}</b>{esc(grid)}")
        if p.get("chaos_score") is not None:
            level = p.get("chaos_level") or "?"
            lines.append(f"   Chaos: <b>{p['chaos_score']}/100</b> — "
                         f"{CHAOS_EMOJI.get(level, '')} {esc(level)}".rstrip())
        if p.get("modules_failed"):
            lines.append(f"   ⚠️ modules failed: {esc(', '.join(p['modules_failed']))}")
        if p.get("url"):
            lines.append(f"   {esc(p['url'])}")
        if p.get("dry_run"):
            lines.append("   <i>dry run — nothing was committed</i>")
        lines.append("")
    return lines


def build_message(report: dict, env: dict) -> str | None:
    """The message, or None when there is genuinely nothing to say."""
    published = report.get("published") or []
    stuck = report.get("stuck") or []
    errors = report.get("errors") or []
    deferred = report.get("deferred") or []
    failed_job = (env.get("JOB_STATUS") or "success") not in ("success", "")

    if not published and not stuck and not errors and not failed_job:
        return None      # a quiet hourly run: say nothing

    run_url = env.get("RUN_URL")
    out: list[str] = []

    if published:
        out.append("<b>Pit Wall IQ — race published</b>")
        out.append("")
        out += published_lines(report)

    if stuck:
        out.append("<b>⚠️ Not published — the data will not settle</b>")
        out.append("")
        for s in stuck:
            out.append(f"• <b>{esc(s.get('label'))}</b> (session {s.get('session_key')})")
            out.append(f"   {esc(s.get('why'))}")
        out.append(f"   An issue is open: {esc(env.get('ISSUES_URL', ''))}".rstrip())
        out.append("")

    if errors:
        out.append("<b>❌ Errors in this run</b>")
        out.append("")
        for e in errors:
            where = f"session {e['session_key']}: " if e.get("session_key") else ""
            out.append(f"• {esc(where)}{esc(e.get('error'))}")
        out.append("")

    if failed_job and not (stuck or errors):
        out.append(f"<b>❌ The publication run failed</b> (status: {esc(env.get('JOB_STATUS'))})")
        out.append("")

    if deferred:
        out.append(f"<i>{len(deferred)} more session(s) ready, deferred to the next run.</i>")
        out.append("")

    if run_url:
        out.append(f"Run: {esc(run_url)}")

    return "\n".join(out).strip()


def send(token: str, chat_id: str, text: str) -> bool:
    payload = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(f"{API}/bot{token}/sendMessage", data=payload)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.loads(r.read())
        if body.get("ok"):
            return True
        # description is Telegram's, e.g. "chat not found" — useful and not secret
        print(f"telegram refused the message: {body.get('description')}")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read()).get("description", "")
        except Exception:
            pass
        print(f"telegram HTTP {exc.code} {detail}")
    except Exception as exc:
        print(f"telegram unreachable: {type(exc).__name__}")
    return False


def load_report(path: str | None) -> dict:
    raw = os.environ.get("REPORT", "").strip()
    if path:
        with open(path) as fh:
            return json.load(fh)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print("REPORT is not valid JSON; nothing to notify")
        return {}


def main() -> int:
    ap = argparse.ArgumentParser(description="Notify Telegram about an autopublish run.")
    ap.add_argument("--report", help="path to the report JSON (default: $REPORT)")
    args = ap.parse_args()

    report = load_report(args.report)
    message = build_message(report, dict(os.environ))
    if message is None:
        print("nothing worth a notification")
        return 0

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        missing = " and ".join(n for n, v in
                               (("TELEGRAM_BOT_TOKEN", token), ("TELEGRAM_CHAT_ID", chat_id)) if not v)
        print(f"{missing} not set — the message would have been:\n\n{message}")
        return 0

    print("sent" if send(token, chat_id, message) else "not sent (see above)")
    return 0        # never fail a run over a notification


if __name__ == "__main__":
    sys.exit(main())
