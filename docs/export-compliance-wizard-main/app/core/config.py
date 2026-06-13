from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Export Compliance Wizard"
    app_env: str = "local"
    cors_origins: str = Field(default="http://localhost:8000")
    ai_classification_enabled: bool = False
    ai_provider_api_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    taric_integration_enabled: bool = False
    lead_email_to: str = "info@exportgateway.eu"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@exportgateway.eu"
    smtp_use_tls: bool = True
    lead_allow_dev_log: bool = False
    mapbox_token: str | None = None
    freight_data_dir: str | None = None
    aes_mode: str = "full"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("aes_mode", mode="before")
    @classmethod
    def normalize_aes_mode(cls, value: str | None) -> str:
        mode = str(value or "full").strip().lower()
        return mode if mode in {"seed", "full"} else "full"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def normalize_cors_origins(cls, value: str | list[str]) -> str:
        if isinstance(value, list):
            return ",".join(value)
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
