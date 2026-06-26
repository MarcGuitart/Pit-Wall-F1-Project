import json as _json
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openf1_base_url: str = "https://api.openf1.org/v1"
    # Optional: OpenF1 API token for fetching sessions not in the static cache
    openf1_api_token: str = ""
    cache_dir: str = "./cache"
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
    groq_model: str = "llama-3.1-8b-instant"

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
    def cache_path(self) -> Path:
        return Path(self.cache_dir)


settings = Settings()
