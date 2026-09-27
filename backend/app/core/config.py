import json as _json
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings

# Absolute path so cache resolution is independent of the process working
# directory (guards against Render starting uvicorn from the repo root
# instead of the backend/ subdirectory).
_DEFAULT_CACHE_DIR = str(Path(__file__).parents[2] / "cache")


class Settings(BaseSettings):
    openf1_base_url: str = "https://api.openf1.org/v1"
    # Paid account: username/password → bearer token, renewed automatically
    # (app/clients/openf1_auth.py). Without them the client is anonymous.
    openf1_username: str = ""
    openf1_password: SecretStr = SecretStr("")
    openf1_token_url: str = "https://api.openf1.org/token"
    # Legacy: a static bearer token (no renewal). Ignored when username/password are set.
    openf1_api_token: str = ""
    # Outgoing rate limit to OpenF1. 0 = pick by mode (55/min with an account,
    # 27/min anonymous — measured limits are 60 and 30). Set both to override.
    openf1_rate_limit_requests: int = 0
    openf1_rate_limit_window_s: float = 60.0
    cache_dir: str = _DEFAULT_CACHE_DIR
    environment: str = "development"
    # Minutes after a session's real end (date_end) before /analysis will serve it.
    session_unlock_buffer_minutes: int = 30
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    # Ollama local AI — use 127.0.0.1, not localhost (avoids IPv6 resolution on some systems)
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b"

    # Groq cloud AI — free tier, no local model required (console.groq.com for API key)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    # Only sent for models that accept it (openai/gpt-oss-*): low | medium | high
    groq_reasoning_effort: str = "medium"

    # /chat rate limit (in-memory sliding window). Per browser session first,
    # per IP as a much higher secondary cap so a classroom behind one NAT
    # still works during a live demo.
    chat_rate_limit_per_session: int = 10
    chat_rate_limit_per_ip: int = 100
    chat_rate_limit_window_s: int = 3600

    # ── PRO access ──────────────────────────────────────────────────────────
    # Seasons anyone may read without a code. Everything else — 2025, the
    # current season, live mode — needs one.
    free_seasons: list[int] = [2023, 2024]
    # The access codes themselves, comma-separated or a JSON array. These are
    # secrets: they go in Render's environment and never in this repo, not even
    # as a real-looking example. Empty means the PRO seasons are locked to
    # everyone, which is the correct default for a fresh checkout.
    pro_access_codes: list[str] = []
    # Signing key for the access tokens. Empty disables redemption entirely
    # rather than signing with a guessable default: a predictable secret is the
    # same as no gate at all, and failing closed is the only safe direction.
    pro_token_secret: SecretStr = SecretStr("")
    pro_token_ttl_days: int = 30

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @field_validator("pro_access_codes", "free_seasons", mode="before")
    @classmethod
    def _parse_list(cls, v: object) -> object:
        """Accept a JSON array or a comma-separated string from an env var."""
        if isinstance(v, str):
            try:
                return _json.loads(v)
            except (_json.JSONDecodeError, ValueError):
                return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        """Accept both comma-separated strings and JSON arrays from env vars."""
        if isinstance(v, str):
            try:
                return _json.loads(v)
            except (_json.JSONDecodeError, ValueError):
                return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def openf1_credentials_configured(self) -> bool:
        """True when any OpenF1 credential is set (account or static token)."""
        return bool(self.openf1_username and self.openf1_password.get_secret_value()) or bool(self.openf1_api_token)

    @property
    def pro_access_configured(self) -> bool:
        """True when a code could actually be redeemed. Both halves are needed."""
        return bool(self.pro_access_codes) and bool(self.pro_token_secret.get_secret_value())

    @property
    def cache_path(self) -> Path:
        return Path(self.cache_dir)


settings = Settings()
