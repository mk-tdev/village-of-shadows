# 6. Model-agnostic adapters and the tool-calling loop

**Files:** [`backend/app/adapters.py`](../../backend/app/adapters.py),
[`backend/app/game/agent_turn.py`](../../backend/app/game/agent_turn.py)

## One interface, five providers

```python
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
        return ChatOllama(model=config.model_name or "llama3.1", base_url=config.endpoint or "http://localhost:11434")
    raise ValueError(f"Unknown provider: {config.provider}")
```
([adapters.py](../../backend/app/adapters.py))

Every provider's LangChain integration implements the same `Runnable`
interface — `.ainvoke(messages)`, `.bind_tools(tools)` — so once
`get_chat_model` picks the right class for a seat's configured provider,
every line downstream in `agent_turn.py` is provider-agnostic: it calls
`bound_model.ainvoke(messages)` without caring or knowing whether that's
Claude, GPT, Gemini, or a local Ollama model. Seven seats in one game can
each run a different provider simultaneously with zero special-casing
anywhere except this one function. Adding a sixth provider means adding one
`if` branch here — nothing else in the codebase changes.

Imports are done lazily (`from langchain_anthropic import ...` *inside* the
branch, not at module top) so that a game using only `claude` and `mock`
seats never needs `langchain_openai`, `langchain_google_genai`, or
`langchain_ollama` importable at all — useful if you haven't installed every
provider's SDK.

## Why "let the model call a tool" beats "ask for JSON and parse it"

A simpler-looking design would prompt the model with "respond with JSON like
`{"target": "Alice"}`" and `json.loads()` the reply. This project
deliberately doesn't do that — every action goes through LangChain's
`bind_tools` + tool-calling loop instead
([agent_turn.py:103-141](../../backend/app/game/agent_turn.py#L103-L141)).
The reasons:

- **Structure is enforced by the API, not by hoping the model formats
  correctly.** A tool schema tells the model exactly what arguments look
  like, and the provider's own function-calling machinery — not a regex or
  a lenient JSON parser — produces a call that matches it. Free-text JSON
  is one stray sentence of preamble away from failing to parse.
- **A tool call is a distinct message type**
  (`ai_msg.tool_calls`), not something you have to fish out of prose. The
  loop can tell "the model made a decision" apart from "the model is still
  thinking out loud" without any string-matching heuristics.
- **It's the same interface real MCP tool servers already expect.** Tool
  calls MCP servers is the actual mechanism (see
  [05](05-mcp-tool-server-identity.md)) — asking for JSON and hand-parsing
  it would mean maintaining a second, parallel way for a model to act that
  bypasses the identity binding, validation, and persistence that
  `actions.py` provides uniformly to every real tool call.

## The loop itself

```python
for _ in range(MAX_TOOL_ITERATIONS):
    ai_msg: AIMessage = await bound_model.ainvoke(messages)
    messages.append(ai_msg)
    ...
    if not ai_msg.tool_calls:
        messages.append(HumanMessage(content=f"You must act by calling one of the provided tools, in particular `{commit_tool_name}`..."))
        continue

    committed_result = None
    for tc in ai_msg.tool_calls:
        tool = tools_by_name.get(tc["name"])
        if tool is None:
            continue
        tool_message = await tool.ainvoke(tc)
        messages.append(tool_message)
        result = _extract_structured_result(tool_message)
        tool_calls_log.append({"tool": tc["name"], "args": tc["args"], "result": result})
        if tc["name"] == commit_tool_name and result is not None:
            committed_result = result

    if committed_result is not None:
        return committed_result
```
([agent_turn.py:110-141](../../backend/app/game/agent_turn.py#L110-L141))

Each turn allows up to `MAX_TOOL_ITERATIONS` (4) round-trips. A model can
call read-only tools first — `get_my_private_context`,
`get_public_transcript`, `get_my_notes` — to gather context, and the loop
keeps going as long as it hasn't yet called that turn's designated
`commit_tool_name` (`submit_night_action` / `submit_statement` /
`submit_vote`, one per phase). The turn ends the moment the commit tool is
called and returns a non-`None` result — not after a fixed number of tool
calls — so a model that commits on its first call finishes in one round-trip,
while one that wants to check its notes first gets the room to do that.

If a model exhausts all 4 iterations without ever calling its commit tool
(unresponsive, confused, or just a weak model that doesn't reliably call
tools), the loop falls through to `_apply_fallback` at the bottom of
`_run_model_turn` — a safe scripted default (e.g. a random legal target) so
one uncooperative model never hangs or crashes the whole game. Robustness
against a flaky model matters more here than perfect turn quality; see
`_apply_fallback` ([agent_turn.py:257-269](../../backend/app/game/agent_turn.py#L257-L269)).

## The mock provider: exercising everything with no API key

```python
def get_chat_model(config: AgentConfig):
    if config.provider == "mock" or config.provider is None:
        return None
```

`agent_turn.run_agent_turn` checks for exactly this:
`if chat_model is None: return await _run_mock_turn(...)`
([agent_turn.py:63-67](../../backend/app/game/agent_turn.py#L63-L67)). The
mock path picks a random legal choice via the *same* `_apply_fallback`
helper a real model's failure path would use, and records a decision with
*estimated* token counts (`len(text) // 4`,
[agent_turn.py:253-254](../../backend/app/game/agent_turn.py#L253-L254))
instead of real usage metadata — there's no API response to read real
counts from. The point isn't to simulate a convincing AI player; it's that
every seat, mock or real, ends up calling the exact same `actions.py`
functions, which means the MCP tool path, the persistence layer, and the SSE
event stream are all exercised identically whether or not you have API keys
configured. This is what makes `test_graph_smoke.py` able to run a full game
to a win condition with zero network calls.

## Reading a tool's result back out

```python
def _extract_structured_result(tool_message) -> dict | None:
    artifact = getattr(tool_message, "artifact", None)
    if artifact is not None and getattr(artifact, "structured_content", None) is not None:
        return artifact.structured_content
    # FastMCP only populates `structuredContent` when a tool's return
    # annotation is concrete enough to build an output schema from (a bare
    # `dict` isn't) — our tools all return plain JSON-serializable dicts, so
    # fall back to parsing the text content it always produces instead.
    ...
```
([agent_turn.py:158-177](../../backend/app/game/agent_turn.py#L158-L177))

A minor but real MCP quirk worth knowing: FastMCP's `structuredContent`
field — the "typed" result of a tool call — only gets populated when a
tool's Python return-type annotation is specific enough to derive a JSON
schema from. This project's tools are annotated `-> dict`, which is too
vague, so `structuredContent` stays empty and the *real* result has to be
parsed out of the plain-text content block every tool call always produces
instead. This function is the fallback path that makes that work
transparently to the rest of the loop.
