"""Environment configuration; secrets never enter API responses."""

from pathlib import Path

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / "app/.env", extra="ignore")

    database_url: str = (
        "postgresql+psycopg://mekascope:mekascope@127.0.0.1:5433/mekascope"
    )
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-3.6-flash"
    ai_timeout_seconds: float = Field(default=60, gt=0, le=300)
    claim_timeout_seconds: float = Field(default=120, gt=0)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    max_image_bytes: int = Field(default=10 * 1024 * 1024, gt=0, le=10 * 1024 * 1024)

    @model_validator(mode="after")
    def valid_claim_timeout(self) -> "Settings":
        if self.claim_timeout_seconds <= self.ai_timeout_seconds:
            raise ValueError("claim_timeout_seconds must exceed ai_timeout_seconds")
        return self
