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
    # Outgoing rate limit to OpenF1 (sliding window). Anonymous documented limit
    # is 30 req / 10 s; the paid limit is higher — measure with scripts/openf1_rate_probe.py.
    openf1_rate_limit_requests: int = 25
    openf1_rate_limit_window_s: float = 10.0
    cache_dir: str = _DEFAULT_CACHE_DIR
    environment: str = "development"
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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

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
    def cache_path(self) -> Path:
        return Path(self.cache_dir)


settings = Settings()
