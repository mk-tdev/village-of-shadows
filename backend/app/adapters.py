"""Model-agnostic provider adapter. Plan §7.

`get_chat_model` returns `None` for the "mock" provider — there is no
LangChain chat model to fake convincingly enough to be worth the effort here.
Instead, callers (see game/agent_turn.py) special-case `provider == "mock"`
and skip straight to a scripted decision, then make the *same* MCP tool call
a real model's tool-calling loop would make. That exercises the full
MCP/SQLite/graph path identically to a real provider, with no network calls
and no API key required.
"""

from app.models import AgentConfig


def get_chat_model(config: AgentConfig):
    if config.provider == "mock" or config.provider is None:
        return None

    if config.provider == "claude":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=config.model_name or "claude-sonnet-4-6")

    if config.provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=config.model_name or "gpt-4.1")

    if config.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=config.model_name or "gemini-2.5-flash")

    if config.provider == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=config.model_name or "llama3.1",
            base_url=config.endpoint or "http://localhost:11434",
        )

    raise ValueError(f"Unknown provider: {config.provider}")
