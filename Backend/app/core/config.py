"""Application configuration loaded from Backend/.env (report 5.11: secrets never in source)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # Backend/ (config.py -> core -> app -> Backend)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # LLM / embeddings (Google Gemini)
    gemini_api_key: str = "YOUR_GEMINI_API_KEY_HERE"
    gemini_model: str = "gemini-3.8-flash"
    gemini_lite_model: str = "gemini-3.5-flash-lite"  # separate free-tier quota bucket
    gemini_embedding_model: str = "gemini-embedding-001"

    # Database (local Docker Postgres)
    database_url: str = "postgresql://careloop:careloop@localhost:5432/telecom_analyzer"

    # Workflow thresholds (report 5.8 router rules)
    confidence_threshold: float = 0.6

    # Paths (relative to Backend/)
    data_dir: str = "data"
    chroma_dir: str = "data/chroma"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def data_path(self) -> Path:
        return BASE_DIR / self.data_dir

    @property
    def chroma_path(self) -> Path:
        return BASE_DIR / self.chroma_dir

    @property
    def documents_path(self) -> Path:
        return self.data_path / "documents"

    @property
    def labels_path(self) -> Path:
        return self.data_path / "labels"

    @property
    def charts_path(self) -> Path:
        return self.data_path / "charts"


settings = Settings()
