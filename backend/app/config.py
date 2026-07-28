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
    # Ollama Cloud (ollama.com's hosted models, e.g. "gpt-oss:120b-cloud") --
    # distinct from a local Ollama install. Unlike the other providers, the
    # `ollama` python package doesn't read this from a bare os.getenv() at
    # request time in a way this app can rely on (see adapters.py's
    # ollama_cloud branch for why it's passed explicitly instead).
    ollama_api_key: str | None = None
    ollama_cloud_url: str = "https://ollama.com"

    @property
    def mcp_url(self) -> str:
        return f"http://{self.host}:{self.port}/mcp"


settings = Settings()
