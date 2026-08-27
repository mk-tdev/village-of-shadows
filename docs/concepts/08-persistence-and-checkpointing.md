# 8. Two kinds of persistence

**Files:** [`backend/app/postgres_schema.py`](../../backend/app/postgres_schema.py), [`backend/app/persistence.py`](../../backend/app/persistence.py), [`backend/app/main.py`](../../backend/app/main.py)

Village of Shadows uses PostgreSQL in two deliberately separate ways. Both layers are durable, but they answer different questions.

## Application tables: history for people to inspect

The application schema owns `games`, `seats`, `log_entries`, `agent_decisions`, notes, belief events, room credentials, replay artifacts, and cached voice. `persistence.py` records what happened, which model was called, what evidence was available, and how a private theory evolved.

This is the source for God Mode, Learning Debrief, replay export, and technical evidence. Deterministic event keys make pause and resume replays read an existing effect rather than creating a duplicate row.

## LangGraph checkpoint tables: exactly where to resume

LangGraph manages separate tables through `AsyncPostgresSaver`. A checkpoint serializes graph state at each transition and associates it with a `thread_id`. A game uses its session ID as the main thread, and every seat mind uses a related private thread ID.

```python
async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
    await checkpointer.setup()
    app.state.graph = build_graph(checkpointer)
```

When `interrupt()` waits for a human, the checkpointer records the exact graph position. `Command(resume=value)` reloads that state and continues safely. The `_sync` helper then repoints the live orchestrator to the checkpoint-restored `GameState`, so MCP and SSE code do not keep a stale state object.

## Why the distinction matters

Application history explains what happened and why, but cannot resume a graph mid-node. Checkpoints can resume the graph, but are not a human-facing audit API. Keeping both layers explicit is what makes a human interrupt durable and the resulting multi-agent behavior teachable.

The Docker test suite uses a separate PostgreSQL service on port 5433 and truncates only that disposable database between tests. It verifies persistence and LangGraph resume behavior without endangering local games.
