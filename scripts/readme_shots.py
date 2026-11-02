"""Capture the four README screenshots from the deployed site.

    pip install playwright && playwright install chromium
    python scripts/readme_shots.py
    python scripts/readme_shots.py --only analysis telemetry

Writes docs/img/readme-{analysis,live,telemetry,chaos}.png at 1440x900, device
scale factor 2. Everything is captured in English from a historical race that is
already published, so the numbers on screen are the site's own, not a mock.

Run it only after the deploy that the README describes is live. The live shot
needs a /live page that is serving a replay of that race; if none is, it is
skipped with a message rather than saving an empty "not live yet" screen.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import Page, TimeoutError as PWTimeout, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "img"

SITE = "https://pitwallengineer.com"
# São Paulo 2024 race: a free season, a published analysis and precomputed
# telemetry (the same session the repo features elsewhere).
RACE_KEY = 9636
VIEWPORT = {"width": 1440, "height": 900}
SCALE = 2

# Texts of buttons that dismiss banners, cookie notices and dialogs.
DISMISS = ("accept", "agree", "got it", "dismiss", "close", "no thanks", "not now", "ok")


def clean(page: Page) -> None:
    """Close popups and hide anything that is not product content."""
    for label in DISMISS:
        for btn in page.get_by_role("button", name=label, exact=False).all():
            try:
                if btn.is_visible() and btn.bounding_box() and btn.bounding_box()["y"] < 700:
                    # Never click the close button of a content panel we want to keep.
                    if "driver card" in (btn.get_attribute("aria-label") or "").lower():
                        continue
                    btn.click(timeout=800)
            except Exception:
                pass
    page.keyboard.press("Escape")
    page.add_style_tag(content="""
        [role="alert"], [data-banner], [aria-label*="cookie" i], [class*="toast" i],
        [class*="Toast"], [aria-label="Open race engineer"] { display: none !important; }
        * { caret-color: transparent !important; }
        *, *::before, *::after { animation: none !important; transition: none !important; }
    """)
    page.mouse.move(0, 0)


def settle(page: Page, extra_ms: int = 1500) -> None:
    page.wait_for_load_state("networkidle", timeout=60_000)
    page.wait_for_timeout(extra_ms)


def open_race(page: Page, tab: str | None = None) -> None:
    page.goto(f"{SITE}/race/{RACE_KEY}", wait_until="domcontentloaded", timeout=90_000)
    # The analysis is computed or fetched on first load; wait for the tab bar.
    page.locator('nav[aria-label="Analysis views"]').wait_for(timeout=120_000)
    if tab:
        page.locator('nav[aria-label="Analysis views"]').get_by_text(tab, exact=False).first.click()
    settle(page)
    clean(page)


def shot(page: Page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"readme-{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"saved {path.relative_to(ROOT)}")


def analysis(page: Page) -> None:
    open_race(page, "Strategy")
    page.evaluate("window.scrollTo(0, 0)")
    shot(page, "analysis")


def telemetry(page: Page) -> None:
    open_race(page, "Telemetry")
    # The replay fetches the precomputed lap; wait for the circuit map's SVG.
    page.locator("svg").first.wait_for(timeout=60_000)
    page.wait_for_timeout(3000)
    clean(page)
    shot(page, "telemetry")


def chaos(page: Page) -> None:
    open_race(page, "Strategy")
    target = page.get_by_text("Chaos", exact=False).first
    target.scroll_into_view_if_needed()
    page.evaluate("window.scrollBy(0, -120)")
    page.wait_for_timeout(500)
    shot(page, "chaos")


def live(page: Page, live_url: str) -> None:
    page.goto(live_url, wait_until="domcontentloaded", timeout=90_000)
    try:
        # A real Timing table means the page is rendering a session, not the
        # "not live yet" or PRO wall states.
        page.get_by_role("button", name="Timing", exact=False).first.wait_for(timeout=60_000)
    except PWTimeout:
        print(f"skipped live: {live_url} is not serving a session (no Timing tab).", file=sys.stderr)
        return
    settle(page, 4000)
    clean(page)
    shot(page, "live")


SHOTS = {"analysis": analysis, "telemetry": telemetry, "chaos": chaos}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", choices=[*SHOTS, "live"], help="capture just these")
    ap.add_argument("--live-url", default=f"{SITE}/live/{RACE_KEY}",
                    help="a /live page that is serving a replay of the race (PRO: set PW_PRO_TOKEN)")
    ap.add_argument("--pro-token", default=None,
                    help="PRO token to place in localStorage for the live page; read from the "
                         "environment variable PW_PRO_TOKEN if omitted. Never commit it.")
    args = ap.parse_args()
    wanted = args.only or [*SHOTS, "live"]

    import os
    token = args.pro_token or os.environ.get("PW_PRO_TOKEN")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=SCALE,
            locale="en-US",
            color_scheme="dark",
        )
        if token:
            ctx.add_init_script(f"try{{localStorage.setItem('pwiq_pro_token', {token!r})}}catch(e){{}}")
        page = ctx.new_page()
        for name in wanted:
            if name == "live":
                live(page, args.live_url)
            else:
                SHOTS[name](page)
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
