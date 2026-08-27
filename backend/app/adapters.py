"""Model-agnostic provider adapter. Plan §7.

`get_chat_model` returns `None` for the "mock" provider — there is no
LangChain chat model to fake convincingly enough to be worth the effort here.
Instead, callers (see game/agent_turn.py) special-case `provider == "mock"`
and skip straight to a scripted decision, then make the *same* MCP tool call
a real model's tool-calling loop would make. That exercises the full
MCP/PostgreSQL/graph path identically to a real provider, with no network calls
and no API key required.
"""

from app.config import settings
from app.models import AgentConfig


def get_chat_model(config: AgentConfig):
    """Every real branch below passes its API key explicitly from
    `settings`, never relying on the provider SDK reading it from a bare
    `os.environ` itself. That's not just belt-and-suspenders: pydantic-
    settings parses `.env` straight into the `settings` object's own
    fields -- it does not also export those values into the process
    environment (confirmed directly: `os.environ` has no entry for
    anything in `.env` unless something else put it there). An SDK's own
    "read OPENAI_API_KEY/ANTHROPIC_API_KEY/... from the environment"
    fallback therefore never actually fires here, `.env` file or not --
    passing the key straight from `settings` is the only path that works,
    matching what the ollama_cloud branch already had to do for the same
    reason.
    """
    if config.provider == "mock" or config.provider is None:
        return None

    if config.provider == "claude":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=config.model_name or "claude-sonnet-5",
            anthropic_api_key=settings.anthropic_api_key,
        )

    if config.provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=config.model_name or "gpt-5.6-terra",
            openai_api_key=settings.openai_api_key,
            # GPT-5.6 reasoning + function tools are supported together on
            # Responses, not Chat Completions. Keeping this on the adapter
            # means setup preflight and live turns always use the same API.
            use_responses_api=True,
        )

    if config.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=config.model_name or "gemini-3.5-flash",
            google_api_key=settings.google_api_key,
        )

    if config.provider == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=config.model_name or "qwen3:8b",
            base_url=config.endpoint or "http://localhost:11434",
        )

    if config.provider == "ollama_cloud":
        from langchain_ollama import ChatOllama

        # Ollama Cloud (hosted models, e.g. "gpt-oss:120b" -- most cloud
        # models are just their plain name; a "-cloud" suffix is only a
        # valid alias for a handful that also exist as local pulls, see
        # seatDefaults.ts) needs bearer-token auth over `client_kwargs`
        # rather than a constructor api-key field, since ChatOllama doesn't
        # expose one directly -- same underlying reason as the other
        # branches above, just a different mechanism for this one client.
        headers = {"Authorization": f"Bearer {settings.ollama_api_key}"} if settings.ollama_api_key else {}
        return ChatOllama(
            model=config.model_name or "gpt-oss:120b",
            base_url=config.endpoint or settings.ollama_cloud_url,
            client_kwargs={"headers": headers},
        )

    raise ValueError(f"Unknown provider: {config.provider}")
