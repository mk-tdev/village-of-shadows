"""Exposes the compiled LangGraph's own structure to the frontend debug
panel -- introspected, not hand-maintained, so the diagram can never drift
from the real orchestration graph. Plan §1's "showcase agentic engineering"
goal, made literal."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/structure")
async def get_structure(request: Request) -> dict:
    graph = request.app.state.graph.get_graph()
    nodes = [{"id": n.id, "name": n.name} for n in graph.nodes.values()]
    edges = [
        {"source": e.source, "target": e.target, "conditional": e.conditional}
        for e in graph.edges
    ]
    return {"nodes": nodes, "edges": edges}
