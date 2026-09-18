import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph, START, END
from typing import TypedDict
from unittest.mock import AsyncMock

from app.game.state_inspector import inspect_thread, inspect_value
from app.routers import games


@pytest.fixture(autouse=True)
def clean_test_orchestrators():
    """These isolated in-memory tests must not truncate the local game database."""
    yield


class State(TypedDict):
    count: int


@pytest.mark.asyncio
async def test_real_checkpoints_parent_diff_and_thread_isolation():
    builder = StateGraph(State)
    builder.add_node('increment', lambda state: {'count': state['count'] + 1})
    builder.add_edge(START, 'increment')
    builder.add_edge('increment', END)
    graph = builder.compile(checkpointer=InMemorySaver())
    await graph.ainvoke({'count': 1}, {'configurable': {'thread_id': 'game:seat_1'}})
    await graph.ainvoke({'count': 90}, {'configurable': {'thread_id': 'game:seat_2'}})
    result = await inspect_thread(graph, 'game:seat_1')
    assert result['values'] == {'count': 2}
    assert result['previous_values'] == {'count': 1}
    assert result['history'][0]['id'] == result['selected']['id']
    historic = await inspect_thread(graph, 'game:seat_1', result['history'][1]['id'])
    assert historic['values'] == {'count': 1}
    foreign = await inspect_thread(graph, 'game:seat_2', result['selected']['id'])
    assert not foreign['available']
    assert not (await inspect_thread(graph, 'game:human'))['available']


def test_context_preserves_observable_messages_without_provider_internals():
    message = AIMessage(content=[{'type': 'text', 'text': 'I vote Mara.'}, {'type': 'reasoning', 'reasoning': 'internal'}],
                        additional_kwargs={'api_key': 'secret'}, response_metadata={'secret': 'secret'})
    exported = inspect_value({'messages': [HumanMessage(content='Your briefing'), message], 'endpoint': 'private-url'})
    assert exported['messages'][0]['content'] == 'Your briefing'
    assert exported['messages'][1]['content'] == [{'type': 'text', 'text': 'I vote Mara.'}]
    assert 'internal' not in str(exported) and 'private-url' not in str(exported)
    assert 'additional_kwargs' not in exported['messages'][1]


@pytest.mark.asyncio
async def test_inspector_denies_non_host_before_checkpoint_read(monkeypatch):
    app = FastAPI()
    app.include_router(games.router)
    app.state.db_conn = object()
    from app.game.access import Viewer
    monkeypatch.setattr(games.access, 'authorize', AsyncMock(return_value=Viewer('seat_0', False, True)))
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get('/games/game/inspector?host_token=wrong')
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_inspector_rejects_foreign_seat(monkeypatch):
    app = FastAPI()
    app.include_router(games.router)
    app.state.db_conn = object()
    from app.game.access import Viewer
    monkeypatch.setattr(games.access, 'authorize', AsyncMock(return_value=Viewer(None, True, True)))
    monkeypatch.setattr(games.persistence, 'get_game_config', AsyncMock(return_value={'seats': [{'seat_id': 'seat_0'}]}))
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get('/games/game/inspector?seat_id=foreign')
    assert response.status_code == 404
