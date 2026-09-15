import pytest
import httpx
from fastapi import FastAPI
from types import SimpleNamespace
from pydantic import ValidationError
from app.game import access, nodes
from app.game.graph import _route_day_discussion
from app.models import GameOptions, AwaitingInput
from app.routers.voice import router
from tests.helpers import make_orchestrator

@pytest.mark.asyncio
async def test_three_passes_give_every_living_agent_three_distinct_turns(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.options = GameOptions(discussion_rounds=3, language="zh")
    orch.state.phase = "day-discuss"
    for player in orch.state.players: player.role = "villager"
    config = {"configurable": {"session_id": orch.session_id}, "metadata": {"langgraph_node": "day_discussion"}}
    for index in range(21):
        assert _route_day_discussion({"game": orch.state}) == "day_discussion"
        await nodes.day_discussion({"game": orch.state}, config)
        assert orch.state.day_index == index + 1
    assert _route_day_discussion({"game": orch.state}) == "start_vote"
    statements = [line for line in orch.state.log if line.type == "statement"]
    assert len(statements) == 21
    for player in orch.state.players: assert sum(line.seat_id == player.seat_id for line in statements) == 3
    restored = type(orch.state).model_validate_json(orch.state.model_dump_json())
    assert restored.options.language == "zh"
    assert _route_day_discussion({"game": restored}) == "start_vote"
    assert "Simplified Chinese" in nodes._briefing(restored, restored.players[0], "Test")

def test_options_reject_unsupported_language_and_unbounded_rounds():
    for fields in ({"language":"fr"},{"discussion_rounds":0},{"discussion_rounds":6}):
        with pytest.raises(ValidationError): GameOptions(**fields)

@pytest.mark.asyncio
async def test_transcription_auth_turn_language_and_size_validation(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    issued = await access.create_game_access(orch.conn, orch.session_id, ["seat_0"])
    app = FastAPI(); app.include_router(router); app.state.db_conn = orch.conn
    params = {"seat_id":"seat_0", "access_token":issued["seat_tokens"]["seat_0"]}
    url = f"/games/{orch.session_id}/transcribe"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post(url, content=b"audio")).status_code == 403
        assert (await client.post(url, params=params, content=b"audio")).status_code == 409
        orch.state.awaiting = AwaitingInput(kind="statement", seat_id="seat_0", prompt="Speak", turn_id="test-turn")
        assert (await client.post(url, params={**params,"language":"fr"}, content=b"audio")).status_code == 422
        assert (await client.post(url, params=params, content=b"audio", headers={"content-type":"text/plain"})).status_code == 415
        assert (await client.post(url, params=params, content=b"x"*(8*1024*1024+1), headers={"content-type":"audio/webm"})).status_code == 413
        assert (await client.post(url, params=params, content=b"", headers={"content-type":"audio/webm"})).status_code == 422

@pytest.mark.asyncio
async def test_transcription_returns_chinese_without_submitting_a_turn(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    issued = await access.create_game_access(orch.conn, orch.session_id, ["seat_0"])
    orch.state.awaiting = AwaitingInput(kind="statement", seat_id="seat_0", prompt="Speak", turn_id="test-turn")
    app = FastAPI(); app.include_router(router); app.state.db_conn = orch.conn
    from app.config import settings
    monkeypatch.setattr(settings, "openai_api_key", "test-only")
    original_client = httpx.AsyncClient; calls=[]
    class SpeechClient:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def post(self,url,**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{"text":"我怀疑 Tomas，但我需要更多证据。"})
    async with original_client(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        monkeypatch.setattr(httpx,"AsyncClient",lambda **kwargs:SpeechClient())
        params={"seat_id":"seat_0","access_token":issued["seat_tokens"]["seat_0"],"language":"zh"}
        response=await client.post(f"/games/{orch.session_id}/transcribe", params=params,content=b"test-recording",headers={"content-type":"audio/webm;codecs=opus"})
    assert response.status_code==200
    assert response.json()["text"].startswith("我怀疑")
    assert calls[0]["data"]["model"]=="gpt-4o-transcribe"
    assert calls[0]["data"]["language"]=="zh"
    assert orch.state.awaiting.turn_id=="test-turn"
    assert not orch.state.log

@pytest.mark.asyncio
async def test_human_receives_distinct_turn_ids_across_three_passes(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.state.phase = "day-discuss"
    for p in orch.state.players: p.role = "villager"
    captured=[]
    def answer(payload):
        captured.append(payload)
        return {"text":"My evidence."}
    monkeypatch.setattr(nodes,"interrupt",answer)
    config={"configurable":{"session_id":orch.session_id},"metadata":{"langgraph_node":"day_discussion"}}
    for index in (0,7,14):
        orch.state.day_index=index
        await nodes.day_discussion({"game":orch.state},config)
    assert [p["turn_id"] for p in captured]==["1:day-discuss:0","1:day-discuss:7","1:day-discuss:14"]
    assert all(f"{i+1}/3" in p["prompt"] for i,p in enumerate(captured))

@pytest.mark.asyncio
async def test_previous_discussion_pass_cannot_submit_into_next_pass(tmp_path):
    from fastapi import HTTPException
    from app.routers.input import submit_input, InputRequest
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.state.awaiting = AwaitingInput(kind="statement", seat_id="seat_0", prompt="Pass two", turn_id="1:day-discuss:7")
    with pytest.raises(HTTPException) as error:
        await submit_input(orch.session_id, InputRequest(seat_id="seat_0",kind="statement",value={"text":"Stale answer","turn_id":"1:day-discuss:0"}))
    assert error.value.status_code == 409
    assert orch.state.awaiting.turn_id == "1:day-discuss:7"
    assert not orch.state.log
