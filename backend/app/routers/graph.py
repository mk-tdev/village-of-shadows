"""Exposes the compiled LangGraph's own structure to the frontend debug
panel -- introspected, not hand-maintained, so the diagram can never drift
from the real orchestration graph. Plan §1's "showcase agentic engineering"
goal, made literal.

There are *two* compiled graphs in this app, and both are reported here: the
main game graph, and the per-seat agent subgraph every AI seat's turn runs
through (see game/seat_mind.py). Reporting only the first one left the debug
panel quietly misleading once the second existed -- it showed the
orchestration and omitted the agents' own reasoning loop entirely.
"""

from typing import Any

from fastapi import APIRouter, Request

router = APIRouter(prefix="/graph", tags=["graph"])


def _describe(compiled: Any) -> dict:
    graph = compiled.get_graph()
    return {
        "nodes": [{"id": n.id, "name": n.name} for n in graph.nodes.values()],
        "edges": [
            {"source": e.source, "target": e.target, "conditional": e.conditional}
            for e in graph.edges
        ],
    }


@router.get("/structure")
async def get_structure(request: Request) -> dict:
    seat_mind = getattr(request.app.state, "seat_mind", None)
    return {
        **_describe(request.app.state.graph),
        # Nested rather than merged into the main node list: these belong to a
        # *different* compiled graph running under its own checkpoint thread,
        # and flattening them would imply edges between the two that don't
        # exist.
        "seat_mind": _describe(seat_mind) if seat_mind is not None else None,
    }
