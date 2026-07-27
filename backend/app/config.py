from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000
    db_path: str = "./village.db"
    cors_origins: list[str] = ["http://localhost:3000"]

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"

    @property
    def mcp_url(self) -> str:
        return f"http://{self.host}:{self.port}/mcp"


settings = Settings()
