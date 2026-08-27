from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = "postgresql://village:village@127.0.0.1:5432/village?sslmode=disable"
    # start.sh runs the frontend on 4001; 3000 stays listed so a plain
    # `next dev` on its own default still works against this backend.
    cors_origins: list[str] = ["http://localhost:4001", "http://localhost:3000"]

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    # Optional lifelike council narration. The browser always retains a
    # no-cost device-voice fallback when this key/model is unavailable.
    openai_tts_model: str = "gpt-4o-mini-tts"
    google_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    # Ollama Cloud (ollama.com's hosted models, e.g. "gpt-oss:120b") --
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
