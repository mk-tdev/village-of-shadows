# 8. Two kinds of persistence, easy to conflate

**Files:** [`backend/app/db.py`](../../backend/app/db.py),
[`backend/app/persistence.py`](../../backend/app/persistence.py),
[`backend/app/main.py`](../../backend/app/main.py)

This project writes to SQLite in two completely different ways, for two
completely different reasons, sharing the same connection and the same
`.db` file but otherwise unrelated to each other. Confusing them is an easy
mistake to make when you first read the code, because both are "SQLite" and
both happen automatically as the game runs — but they answer different
questions.

## Kind 1: `agent_decisions` / `log_entries` / `seats` / `games` — history for humans to read

```python
CREATE TABLE IF NOT EXISTS log_entries (...);
CREATE TABLE IF NOT EXISTS agent_decisions (...);
CREATE TABLE IF NOT EXISTS agent_notes (...);
```
([db.py](../../backend/app/db.py))

These four tables (`games`, `seats`, `log_entries`, `agent_decisions`,
`agent_notes`) exist to answer questions like "what did this game's log
look like," "what prompt did seat 3 actually receive on round 2, and what
did the model respond with," "what note did the seer write to itself."
`persistence.py` is a thin, hand-written set of `INSERT`/`SELECT` functions
against this schema — ordinary application-level persistence, the same kind
you'd write for any app with a database.

This is the layer that makes the "showcase agentic engineering" debug view
possible after the fact: `GET /games/{id}/decisions`
([routers/games.py:78-81](../../backend/app/routers/games.py#L78-L81))
reads straight out of `agent_decisions` to answer "show me every model call
this game made, with its prompt, raw response, and latency." Nothing about
LangGraph or `interrupt()` is involved in this layer at all — it would work
identically if the whole orchestration were still a plain Python loop.

## Kind 2: the LangGraph checkpointer — durability for `interrupt()`

```python
checkpointer = AsyncSqliteSaver(conn)
await checkpointer.setup()
...
app.state.graph = build_graph(checkpointer)
```
([main.py:21-29](../../backend/app/main.py#L21-L29))

This is a *second*, separate concern, answering a different question
entirely: "if this graph is suspended mid-execution — inside a
node, at an `interrupt()` call, waiting on a human or a pause — how does it
know where it was when someone resumes it?" `AsyncSqliteSaver` is
LangGraph's own SQLite-backed implementation of a *checkpointer*: every
time the graph transitions between nodes, it serializes the current
`GraphState` (the `{"game": GameState}` dict) and writes it to its own
tables (managed entirely by LangGraph internally — not the tables in
`db.py`'s `SCHEMA`) under a **thread ID**.

```python
self.config = {"configurable": {"thread_id": session_id, "session_id": session_id}}
```
([orchestrator.py:57](../../backend/app/game/orchestrator.py#L57))

Every game's `session_id` doubles as its checkpointer thread ID. When
`resume()` calls `graph.astream(Command(resume=value), self.config)`, the
checkpointer uses that thread ID to find the exact serialized state the
graph was in in when it suspended, deserializes it, and hands it back to
the node that's resuming — which is also *why* `nodes.py`'s `_sync`
function has to exist at all:

```python
def _sync(config: RunnableConfig, game: GameState):
    """Re-point the registry's live GameState at whatever object LangGraph
    just handed this node. Necessary because a resumed run (after an
    `interrupt()`) restores "game" from the checkpoint's serialized copy —
    a different Python object than the one before suspension..."""
    session_id = config["configurable"]["session_id"]
    orch = registry.get(session_id)
    orch.state = game
    ...
```
([nodes.py:33-70](../../backend/app/game/nodes.py#L33-L70))

The `game` object a resumed node receives is a *freshly deserialized copy*
from the checkpoint, not the same Python object `orch.state` pointed at
before suspension. `_sync` is the one place that re-points `orch.state` at
this new object on every single node execution — anything reading
`orch.state` from outside a node (an MCP tool handler, an SSE route) would
otherwise be holding a stale reference the moment a resume happens.

## Why the distinction matters in practice

If you only had persistence Kind 1 (the hand-written tables) and no
checkpointer, `interrupt()` would have nowhere durable to leave the graph's
exact execution position — a server restart mid-game would lose the ability
to resume at all, even though the *history* (who said what) would still be
intact in `log_entries`. Conversely, if you only had the checkpointer and no
hand-written tables, the game could still pause and resume correctly, but
there'd be no queryable history of *why* a model made a decision — the
checkpointer's job is "where was I," not "what happened and why," and it's
not meant to be read by anything except LangGraph's own resume logic.

Both share one physical `.db` file and one `aiosqlite.Connection`
(`app.state.db_conn`, opened once in `lifespan` — see
[01-fastapi-app-shape.md](01-fastapi-app-shape.md)) purely as a resource
convenience; there's no meaningful coupling between their schemas, and
nothing in `persistence.py` ever reads checkpointer tables or vice versa.
