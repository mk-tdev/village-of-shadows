# 11. Application walkthrough: one turn, end to end

This traces a single concrete sequence of events through every layer
described in this guide — starting a game, connecting to it, and one AI
seat taking its night action — followed by shorter walkthroughs of the
human-turn path and the pause/continue path, since those diverge partway
through. Read this after the other files; it's meant to show how the pieces
click together, not to introduce anything new.

## Part A: creating a game and connecting to it

**1. The control panel submits seat configs.**
The frontend's setup page collects 7 seats (exactly one `controller:
"human"`, the rest `"ai"` with a provider + model each) and calls
`createGame(configs)` →
`POST /games` with the list as JSON
([frontend/lib/api.ts](../../frontend/lib/api.ts)).

**2. `create_game` validates and builds `GameState` — but deliberately
does *not* start the graph yet.**
```python
session_id = str(uuid.uuid4())
players = [Player(...) for c in configs]
state = GameState(session_id=session_id, players=players)
...
orch = GameOrchestrator(session_id, state, conn, graph)
registry.register(orch)
# Deliberately not orch.start() here -- see GameOrchestrator.started's
# docstring.
return {"session_id": session_id}
```
([routers/games.py:13-48](../../backend/app/routers/games.py#L13-L48))

The orchestrator exists and is registered — `GET /state` and `GET /stream`
both work against it immediately — but its background task never gets
created here. `GameState.phase` defaults to `"lobby"` and just sits there.
This wasn't always the design: `create_game` used to call `orch.start()`
immediately, and the graph would begin running **in the background**
before the HTTP response even returned. In practice that meant a fast game
(especially with mock-provider seats) could race ahead several nodes —
`assign_roles`, a few `night_wolves` turns — before the frontend's browser
had even navigated to the game page and opened its SSE connection, so a
player would land on a game already a few steps deep with no idea what
they'd missed. See [07](07-pausing-with-interrupt.md) for the
`GameOrchestrator.started` flag and the `POST /{id}/begin` route that
replaced the automatic start.

**3. The frontend redirects to `/game/{session_id}` and opens the stream
— while the game is still sitting in `"lobby"`.**
`useGameStream(sessionId)` opens `new EventSource(streamUrl(sessionId))` →
`GET /games/{id}/stream`. The route calls `orch.subscribe()`, gets its own
queue, and immediately yields a `"state"` event with the current
`GameState` — phase `"lobby"`, no roles assigned, nothing in the log yet,
because nothing has run. `GameView.tsx` renders a "Ready when you are"
overlay in exactly this state
([GameView.tsx](../../frontend/components/GameView.tsx)) with a
**Start Game** button.

**3a. Clicking Start Game is what actually kicks off the graph.**
```python
@router.post("/{session_id}/begin")
async def begin_game(session_id: str) -> dict:
    ...
    if orch.started:
        raise HTTPException(409, "Game has already begun.")
    orch.start()
    return {"ok": True}
```
([routers/games.py:51-66](../../backend/app/routers/games.py#L51-L66))

*Now* `orch.start()` calls `asyncio.create_task(self._run({"game":
self.state}))` — but this time, the browser's SSE connection has already
been open and receiving events since step 3, so every node transition from
`assign_roles` onward streams in live from the very first one. There's no
window left where the graph can run ahead of a connection that hasn't
opened yet, because the human is the one who opens that door.

## Part B: one AI werewolf's night action

Say the graph has reached the `night_wolves` node, and it's an AI seat's
(not the human's) turn to choose an attack target.

**4. `_sync` re-points the orchestrator's state and announces the node.**
```python
orch = _sync(config, game)   # orch.state = game; publish("node", {"node": "night_wolves"})
```
The debug panel's graph diagram (see
[10-frontend-observability.md](10-frontend-observability.md)) highlights
`night_wolves` the moment this SSE event arrives — before the wolf's turn
has even started.

**5. `night_wolves` picks the current wolf and calls `run_agent_turn`.**
```python
wolf = wolves[game.wolf_index]
pool = [p.name for p in game.alive_players() if p.role != "werewolf"]
_emit_turn(orch, wolf.seat_id, wolf.name)          # "turn" SSE event -- feed shows "X is thinking"
await run_agent_turn(orch, wolf, phase="night", ...,
                      commit_tool_name="submit_night_action", fallback={"pool": pool})
```
([nodes.py:170-205](../../backend/app/game/nodes.py#L170-L205))

**6. `run_agent_turn` resolves this seat's provider and opens an MCP session.**
```python
chat_model = get_chat_model(config)      # e.g. ChatAnthropic for this seat's configured provider
token = identity.mint_token(orch.session_id, wolf.seat_id)
async with create_session({"transport": "streamable_http", "url": settings.mcp_url}) as session:
    await session.initialize()
    await session.call_tool("bind_seat", {"token": token})
    all_tools = await load_mcp_tools(session)
    model_tools = [t for t in all_tools if t.name in MODEL_VISIBLE_TOOLS]   # bind_seat filtered out here
    bound_model = chat_model.bind_tools(model_tools)
```
([agent_turn.py:92-106](../../backend/app/game/agent_turn.py#L92-L106))

This is the moment identity gets bound to a real MCP connection — see
[05-mcp-tool-server-identity.md](05-mcp-tool-server-identity.md), including
the double-mount routing pitfall this exact HTTP round-trip once hit before
`mcp.settings.streamable_http_path` was corrected. Note this is a real
round-trip to `http://127.0.0.1:8000/mcp`, the mounted sub-app from
[main.py](../../backend/app/main.py) — even though it's the same process,
it goes through the actual MCP protocol. Right after `bind_seat` succeeds,
the orchestrator also publishes an `"mcp"` SSE event
(`{"action": "bind", "seat_id": ..., "phase": "night"}`,
[agent_turn.py:102-104](../../backend/app/game/agent_turn.py#L102-L104)) —
the debug panel's live activity feed shows "Bob opened an MCP session
(night)" the instant this happens, well before the model has said anything
(see [10](10-frontend-observability.md)).

**7. The tool-calling loop runs.**
```python
messages = [SystemMessage(content=_persona(wolf, game)), HumanMessage(content=user_prompt)]
for _ in range(MAX_TOOL_ITERATIONS):
    ai_msg = await bound_model.ainvoke(messages)      # real API call to Claude/OpenAI/Gemini/Ollama
    ...
    for tc in ai_msg.tool_calls:
        tool_message = await tool.ainvoke(tc)          # -> MCP call -> submit_night_action handler
        orch.publish("mcp", {"action": "call", "tool": tc["name"], ...})  # activity feed: "Bob called submit_night_action"
        ...
        if tc["name"] == commit_tool_name and result is not None:
            committed_result = result
    if committed_result is not None:
        return committed_result
```
The system prompt here is `_persona(wolf, game)`
([nodes.py:450-467](../../backend/app/game/nodes.py#L450-L467)) — which
tells this seat its personality, its secret role, and (only because it's a
werewolf) its teammate's name. This is hand-built per-call rather than
routed through `build_agent_view`, but it follows the identical
partial-observability rule: no information beyond what this specific role
should know goes into the prompt.

**8. The model calls `submit_night_action`, which reaches the MCP handler.**
```python
@mcp.tool()
async def submit_night_action(target: str, thought: str = "", ctx: Context = None) -> dict:
    game_id, seat_id = identity.resolve(ctx.session)   # -- resolved from the connection, not an argument
    orch = registry.get(game_id)
    return await actions.apply_night_action(orch, seat_id, target, thought)
```
([mcp_server/server.py:90-95](../../backend/app/mcp_server/server.py#L90-L95))

**9. `actions.apply_night_action` enforces the rules and writes the log.**
```python
if player.role == "werewolf":
    pool = [p.name for p in state.alive_players() if p.role != "werewolf"]
    if target_name not in pool:
        raise ActionError(...)
    state.night_proposals.append(target_name)
    await _append_log(orch, type_="werewolf", ..., private=True)   # writes log_entries row + publishes "log"
    return {"ok": True, "target": target_name}
```
([actions.py:56-74](../../backend/app/game/actions.py#L56-L74))

The target gets validated against the *current* legal pool (not trusted
from the model), appended to `game.night_proposals` for tonight's tally,
and logged as `private=True` — meaning `build_agent_view` and
`get_public_transcript` will both filter it out of what any other seat ever
sees (see [04](04-partial-observability-agent-view.md)).

**10. Back in `run_agent_turn`, the turn's `finally` block records the decision.**
```python
finally:
    identity.release(session)
    latency_ms = int((time.monotonic() - start) * 1000)
    await _record_decision(orch, wolf, phase="night", ..., input_tokens=..., output_tokens=...)
```
This writes an `agent_decisions` row (see
[08-persistence-and-checkpointing.md](08-persistence-and-checkpointing.md))
and publishes a `"decision"` SSE event — the row the debug panel's metrics
table grows by one ([10](10-frontend-observability.md)).

**11. The node finishes, loops or moves on, and the graph continues unattended.**
```python
game.wolf_index += 1
_emit_turn(orch, None, None)     # clears "X is thinking" in the feed
_maybe_pause(orch, game)         # no-op unless a pause was requested (see doc 07)
return {"game": game}
```
`_route_night_wolves` then decides whether to loop back to `night_wolves`
for the next wolf, or move on to `night_doctor` — all inside the same
`graph.astream(...)` call from step 2, with **no HTTP request involved at
any point in this whole sequence** except the original MCP tool calls. The
graph just keeps running through nodes until it either finishes the round
or hits a real `interrupt()` (a human's turn, or a pause).

**12. The frontend has been updating live the entire time.**
Every `publish()` call in steps 4–11 above reached the browser within
milliseconds via the SSE connection opened in step 3 — the "X is thinking"
indicator, the graph-flow highlight, the new log line, the metrics table
row, and the debug panel's live activity feed (which shows this entire
sequence — node entered, turn started, MCP session bound, tool called,
decision committed — as a running, chronological list, see
[10](10-frontend-observability.md)) all appeared as this sequence played
out, not after it finished. A browser that instead connects *partway*
through all this — a page refresh, say — doesn't get to replay steps 4–11
retroactively, but it does immediately get the *current* node from
`orch.current_node` in the connection handshake (see
[09](09-sse-streaming-and-broadcast.md)), so the graph highlight is never
stuck showing something stale.

## Part C: the human seat's turn (where it diverges)

When `_route_night_wolves`/`day_discussion`/`voting` eventually reaches the
human seat, the node takes the other branch:

```python
if wolf.controller == "human":
    answer = interrupt({"kind": "night_action", "seat_id": wolf.seat_id, "prompt": "...", "options": pool})
    await actions.apply_night_action(orch, wolf.seat_id, answer["target"], answer.get("thought", ""))
```

`interrupt()` unwinds out of the graph entirely (see
[03-human-in-the-loop-interrupt.md](03-human-in-the-loop-interrupt.md)).
`GameOrchestrator._run` catches the `"__interrupt__"` event, sets
`orch.state.awaiting`, publishes `"awaiting_input"`, and **returns** — the
background task ends, and nothing is running for this game until the human
acts. The frontend's `Controls` component renders the prompt from
`game.awaiting` and, once the human clicks/submits, calls `submitInput(...)`
→ `POST /games/{id}/input`, which validates the answer matches what's
expected and calls `orch.resume(value)` — a brand-new `graph.astream(...)`
call with `Command(resume=value)`, re-entering the same node from the top,
this time with `interrupt()` returning the human's answer instead of
raising. Steps 9 onward (validate, log, continue the graph) are identical
from here — a human's answer and a model's tool call both end up calling
the exact same `actions.py` function.

## Part D: pause and continue, layered on top of either path

If a `POST /games/{id}/pause` arrives *at any point* during Part B or Part
C, nothing changes immediately — `orch.pause_requested` just becomes
`True`. Whichever node is currently running (an AI turn's tool loop, or a
suspended human turn waiting to be answered) finishes completely
unaffected. Only once that node reaches its `_maybe_pause(orch, game)` call
at the very end does anything happen: the flag is consumed, `game.paused`
flips to `True`, a `"paused"` SSE event fires, and a *second* `interrupt()`
call — `interrupt({"kind": "paused"})` — suspends the graph the same way a
human turn would, except `GameOrchestrator._run` recognizes the `"kind":
"paused"` payload and returns without setting `awaiting` (nobody's answer
is expected). `POST /games/{id}/continue` calls `orch.resume(True)` — the
same resume path as everything else in this guide — which re-enters the
paused node from the top, `_maybe_pause` consumes the sentinel and returns
instantly since `pause_requested` is now `False`, flips `game.paused` back
to `False`, publishes `"resumed"`, and the node finishes exactly as if the
pause had never interrupted it. See
[07-pausing-with-interrupt.md](07-pausing-with-interrupt.md) for the one
subtlety this reuse required getting right: `_maybe_pause` must always run
*after* any human-turn `interrupt()` in the same node, never before it.

## The throughline

Every one of the four paths above — an AI turn, a human turn, a pause, and
a continue — ends up going through exactly two shared choke points no
matter how it got there: `actions.py` (the only place game rules are
enforced and state is mutated) and `orch.publish(...)` (the only way any
event reaches a browser). That's not an accident of how this was built; it's
the direct consequence of the design principles in docs 03–09 — validate
identity at the connection, validate rules at one function, and treat every
state change as an event to broadcast, not a value to poll for.
