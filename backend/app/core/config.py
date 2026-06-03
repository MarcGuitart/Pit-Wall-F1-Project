from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    openf1_base_url: str = "https://api.openf1.org/v1"
    cache_dir: str = "./cache"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cache_path(self) -> Path:
        return Path(self.cache_dir)


settings = Settings()
