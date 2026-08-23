from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app import persistence

router = APIRouter(prefix="/relationships", tags=["relationships"])


class MemoryEdit(BaseModel):
    memory: str = Field(min_length=1, max_length=800)


@router.get("")
async def list_memories(request: Request, owner_name: str | None = None) -> list[dict]:
    return await persistence.get_relationship_memories(
        request.app.state.db_conn, owner_name, include_inactive=True,
    )


@router.patch("/{memory_id}")
async def edit_memory(memory_id: int, body: MemoryEdit, request: Request) -> dict:
    if not await persistence.edit_relationship_memory(
        request.app.state.db_conn, memory_id, " ".join(body.memory.split()),
    ):
        raise HTTPException(404, "No such relationship memory.")
    return {"ok": True}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: int, request: Request) -> dict:
    if not await persistence.delete_relationship_memory(request.app.state.db_conn, memory_id):
        raise HTTPException(404, "No such relationship memory.")
    return {"ok": True}
