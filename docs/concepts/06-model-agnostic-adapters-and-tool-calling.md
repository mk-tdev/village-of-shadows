# 6. Model-agnostic adapters and the tool-calling loop

**Files:** [`backend/app/adapters.py`](../../backend/app/adapters.py),
[`backend/app/game/agent_turn.py`](../../backend/app/game/agent_turn.py),
[`backend/app/model_preflight.py`](../../backend/app/model_preflight.py)

## One interface, six providers

```python
def get_chat_model(config: AgentConfig):
    if config.provider == "mock" or config.provider is None:
        return None
    if config.provider == "claude":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=config.model_name or "claude-sonnet-5", anthropic_api_key=settings.anthropic_api_key)
    if config.provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=config.model_name or "gpt-5.6-terra",
            openai_api_key=settings.openai_api_key,
            use_responses_api=True,
        )
    if config.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=config.model_name or "gemini-3.5-flash", google_api_key=settings.google_api_key)
    if config.provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=config.model_name or "qwen3:8b", base_url=config.endpoint or "http://localhost:11434")
    if config.provider == "ollama_cloud":
        from langchain_ollama import ChatOllama
        headers = {"Authorization": f"Bearer {settings.ollama_api_key}"} if settings.ollama_api_key else {}
        return ChatOllama(
            model=config.model_name or "gpt-oss:120b",
            base_url=config.endpoint or settings.ollama_cloud_url,
            client_kwargs={"headers": headers},
        )
    raise ValueError(f"Unknown provider: {config.provider}")
```
([adapters.py](../../backend/app/adapters.py))

Every provider's LangChain integration implements the same `Runnable`
interface — `.ainvoke(messages)`, `.bind_tools(tools)` — so once
`get_chat_model` picks the right class for a seat's configured provider,
every line downstream in `agent_turn.py` is provider-agnostic: it calls
`bound_model.ainvoke(messages)` without caring or knowing whether that's
Claude, GPT, Gemini, a local Ollama model, or an Ollama Cloud model. Seven
seats in one game can each run a different provider simultaneously with
zero special-casing anywhere except this one function. Adding a new
provider means adding one `if` branch here — nothing else in the codebase
changes; `ollama_cloud` is a real example of exactly that, added after
`ollama` itself.

The OpenAI branch explicitly selects the Responses API. This is not an
optional optimisation for the current GPT-5.6 catalog: those models reject
reasoning plus function tools on Chat Completions. The preflight reproduced
that provider error before this flag was added, while Gemini and Ollama
passed the same tool-call probe. Keeping the choice inside the adapter makes
both preflight and live turns use the required endpoint without introducing
OpenAI-specific logic into either caller.

Imports are done lazily (`from langchain_anthropic import ...` *inside* the
branch, not at module top) so that a game using only `claude` and `mock`
seats never needs `langchain_openai`, `langchain_google_genai`, or
`langchain_ollama` importable at all — useful if you haven't installed every
provider's SDK.

**Every real branch passes its key explicitly from `settings` — none of
them rely on the SDK's own "read it from the environment" fallback,** and
that's not belt-and-suspenders, it's load-bearing: `pydantic-settings`
parses `.env` straight into the `settings` object's own fields (see
[01](01-fastapi-app-shape.md)) and never exports those values into the
process's actual `os.environ`. The `anthropic`/`openai`/`google-genai`
SDKs, and the underlying `ollama` package's own `os.getenv("OLLAMA_API_KEY")`
auto-pickup, all only look at a bare `os.environ` — so relying on any of
them would only work by accident, if something else happened to export
that variable into the process environment first. This was a real bug,
not a hypothetical: the first version of this file *did* rely on SDK
auto-detection for claude/openai/gemini, and every one of them silently
had no working credentials regardless of what was in `.env`, surfacing
eventually as `"Missing credentials. Please pass an api_key... or set the
OPENAI_API_KEY... environment variable"` the first time a real provider
seat was actually tried. Passing the key straight from `settings` — the one
place that reliably has it — sidesteps the whole question.

**`ollama_cloud` needs one more mechanism beyond that,** since `ChatOllama`
has no constructor field for an API key the way `ChatAnthropic`/`ChatOpenAI`/
`ChatGoogleGenerativeAI` do: `client_kwargs={"headers": {...}}` passes a
bearer token as an HTTP header instead, forwarded straight to the
underlying `ollama.Client`/`ollama.AsyncClient`. Same underlying reason as
the paragraph above, just a different mechanism for this one library.

**A second real bug this surfaced: guessed model names silently 410.**
Ollama Cloud's actual catalog uses plain model names for almost everything — a `-cloud` suffix is
only a valid alias for a handful of models, like `gpt-oss`, that also exist
as local pulls, where the suffix disambiguates "run the cloud one"
from "run whatever I have pulled locally under this same name." Guessing
that *every* cloud model followed the `-cloud`-suffix convention (an
earlier version of `PROVIDER_MODEL_SUGGESTIONS.ollama_cloud` in
[`seatDefaults.ts`](../../frontend/lib/seatDefaults.ts) did exactly this)
meant some entries pointed at names that don't exist at all, which
`POST /api/chat` rejects with `410 Gone` — a real, reproduced failure, not
a hypothetical one. The fix was mechanical once diagnosed: query
`GET https://ollama.com/api/tags` with the same bearer token this app
already uses, and replace every guessed name with one straight from that
response. There's no way to derive Ollama Cloud's current catalog from
first principles — it's an external, changing service — so re-verify
against your own account's `/api/tags` if a listed model ever stops
resolving.

## Fail at setup, not during the third round

A model ID can be syntactically plausible and still be unusable for this
game: it may have been retired, be unavailable to this account, point at a
local model that was never pulled, or answer text without supporting tool
calls. Constructing a LangChain adapter proves none of those things. Before
the setup page creates a game, `POST /games/preflight` sends every unique AI
configuration a small real message with a bound `confirm_game_model` tool.
It passes only when the returned `AIMessage.tool_calls` contains that exact
tool and its expected argument.

The frontend model control remains an editable combobox: provider-verified
IDs are suggestions, not a permanently closed catalog. This matters for new
hosted releases and locally named Ollama pulls. Safety comes from proving the
exact entered ID at setup, not from assuming a hard-coded list can never age.

[`model_preflight.py`](../../backend/app/model_preflight.py) deliberately
uses `get_chat_model` and `.bind_tools()` just like a live turn, so the check
covers the complete provider path: credentials, endpoint, model access,
message generation, and function calling. Duplicate seats using the same
provider/model/endpoint share one request, but receive separate results in
the UI. The mock provider passes without network access, and human seats are
not checked because they never instantiate a model.

The route is read-only. A failed check creates no database row, orchestrator,
or graph thread; the player stays on setup with the provider's error beside
the affected seat. This moves a previously destructive late failure to the
only place it is cheap to fix.

## Why "let the model call a tool" beats "ask for JSON and parse it"

A simpler-looking design would prompt the model with "respond with JSON like
`{"target": "Alice"}`" and `json.loads()` the reply. This project
deliberately doesn't do that — every action goes through LangChain's
`bind_tools` + tool-calling loop instead
([agent_turn.py:125-166](../../backend/app/game/agent_turn.py#L125-L166)).
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
    ai_msg: AIMessage = await bound_model.ainvoke(history + appended)
    appended.append(ai_msg)
    ...
    if not ai_msg.tool_calls:
        appended.append(HumanMessage(content=f"You must act by calling one of the provided tools, in particular `{commit_tool_name}`..."))
        continue

    committed_result = None
    for tc in ai_msg.tool_calls:
        tool = tools_by_name.get(tc["name"])
        if tool is None:
            continue
        tool_message = await tool.ainvoke(tc)
        appended.append(tool_message)
        result = _extract_structured_result(tool_message)
        tool_calls_log.append({"tool": tc["name"], "args": tc["args"], "result": result})
        if tc["name"] == commit_tool_name and result is not None:
            committed_result = result

    if committed_result is not None:
        return committed_result, appended
```
([agent_turn.py:131-166](../../backend/app/game/agent_turn.py#L131-L166))

`history` is what this seat already remembers of the game and `appended` is
what this turn adds — the loop reads the first and grows the second, then
hands the delta back to the caller. That split is what lets the same loop
serve a seat with a game-long memory
([12](12-per-seat-agent-memory-subgraphs.md)); everything else about it is
unchanged, and none of it is provider-specific.

Each turn allows up to `MAX_TOOL_ITERATIONS` (4) round-trips. A model can
call read-only tools first — `get_my_private_context`,
`get_public_transcript`, `get_my_notes` — to gather context, and the loop
keeps going as long as it hasn't yet called that turn's designated
`commit_tool_name` (`submit_night_action` / `submit_statement` /
`submit_vote`, one per phase). The turn ends the moment the commit tool is
called and returns a non-`None` result — not after a fixed number of tool
calls — so a model that commits on its first call finishes in one round-trip,
while one that wants to check its notes first gets the room to do that.

Every real MCP touchpoint here also calls `orch.publish("mcp", ...)` — once
right after `bind_seat` succeeds, and once per tool call inside this loop
(`orch.publish("mcp", {"action": "call", "tool": tc["name"], ...})`,
[agent_turn.py:155-158](../../backend/app/game/agent_turn.py#L155-L158)).
This has no effect on the loop's own logic — it exists purely so the
frontend's live activity feed can show *when* an MCP session opens and
*which* tool gets called, as it happens, rather than only after the fact
from the aggregated `"decision"` event below. See
[10-frontend-observability.md](10-frontend-observability.md).

If a model exhausts all 4 iterations without ever calling its commit tool
(unresponsive, confused, or just a weak model that doesn't reliably call
tools), the loop falls through to `_apply_fallback` at the bottom of
`_run_model_turn` — a safe scripted default (e.g. a random legal target) so
one uncooperative model never hangs or crashes the whole game. Robustness
against a flaky model matters more here than perfect turn quality; see
`_apply_fallback` ([agent_turn.py:323-335](../../backend/app/game/agent_turn.py#L323-L335)).

## The mock provider: exercising everything with no API key

```python
def get_chat_model(config: AgentConfig):
    if config.provider == "mock" or config.provider is None:
        return None
```

`agent_turn.run_turn_with_history` checks for exactly this:
`if chat_model is None: return await _run_mock_turn(...)`
([agent_turn.py:80-85](../../backend/app/game/agent_turn.py#L80-L85)). The
mock path picks a random legal choice via the *same* `_apply_fallback`
helper a real model's failure path would use, and records a decision with
*estimated* token counts (`len(text) // 4`,
[agent_turn.py:319-320](../../backend/app/game/agent_turn.py#L319-L320))
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
([agent_turn.py:218-237](../../backend/app/game/agent_turn.py#L218-L237))

A minor but real MCP quirk worth knowing: FastMCP's `structuredContent`
field — the "typed" result of a tool call — only gets populated when a
tool's Python return-type annotation is specific enough to derive a JSON
schema from. This project's tools are annotated `-> dict`, which is too
vague, so `structuredContent` stays empty and the *real* result has to be
parsed out of the plain-text content block every tool call always produces
instead. This function is the fallback path that makes that work
transparently to the rest of the loop.
