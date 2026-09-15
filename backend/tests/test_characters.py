from io import BytesIO

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from PIL import Image

from app import persistence
from app.game import access
from app.game.views import build_human_state_view
from app.routers import characters
from app.game.graph import _route_day_discussion
from tests.helpers import make_orchestrator


def photo():
    out = BytesIO()
    Image.new("RGB", (256, 384), "#8f7655").save(out, "PNG")
    return out.getvalue()


def test_rejects_invalid_and_tiny_photos():
    for data in [b"not an image", b"<svg></svg>"]:
        with pytest.raises(HTTPException):
            characters.normalize_photo(data)
    normalized = characters.normalize_photo(photo())
    with Image.open(BytesIO(normalized)) as image:
        assert image.size == (256, 384)
        assert not image.getexif()
    full, face = characters.prepare_art(normalized)
    assert Image.open(BytesIO(full)).format == "WEBP"
    assert max(Image.open(BytesIO(face)).size) <= 384


@pytest.mark.asyncio
async def test_generate_persist_multiplayer_identity_and_permissions(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    issued = await access.create_game_access(orch.conn, orch.session_id, ["seat_0", "seat_1"])
    app = FastAPI(); app.include_router(characters.router); app.state.db_conn = orch.conn
    monkeypatch.setattr(characters.settings, "openai_api_key", "test-key")
    calls = []
    async def fake_generate(data):
        calls.append(data)
        return characters.prepare_art(data)
    monkeypatch.setattr(characters, "generate_art", fake_generate)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post('/characters/generate', content=b'bad')).status_code == 400
        assert (await client.post('/characters/generate', content=b'x' * (characters.MAX_UPLOAD + 1))).status_code == 413
        ids = []
        for seat in ['seat_0', 'seat_1']:
            generated = await client.post('/characters/generate', content=photo())
            assert generated.status_code == 200
            asset_id = generated.json()['character_id']; ids.append(asset_id)
            assert len(asset_id) == 64
            image = await client.get(f'/characters/{asset_id}/full')
            assert image.status_code == 200 and image.headers['content-type'] == 'image/webp'
            params = {'seat_id': seat, 'access_token': issued['seat_tokens'][seat]}
            updated = await client.put(f'/games/{orch.session_id}/character', params=params, json={'character_id': asset_id})
            assert updated.status_code == 200, updated.text
        assert ids[0] != ids[1]
        state = build_human_state_view(orch.state, seat_id='seat_1', host=False)
        assert [p['character_id'] for p in state['players'][:2]] == ids
        config = await persistence.get_game_config(orch.conn, orch.session_id)
        assert [p['character_id'] for p in config['seats'][:2]] == ids
        bad = {'seat_id': 'seat_1', 'access_token': issued['seat_tokens']['seat_0']}
        assert (await client.put(f'/games/{orch.session_id}/character', params=bad, json={'character_id': ids[0]})).status_code == 403
        params = {'seat_id': 'seat_0', 'access_token': issued['seat_tokens']['seat_0']}
        assert (await client.put(f'/games/{orch.session_id}/character', params=params, json={'character_id': 'f'*64})).status_code == 404
        orch.started = True
        assert (await client.put(f'/games/{orch.session_id}/character', params=params, json={'character_id': None})).status_code == 409
        assert orch.state.players[0].character_id == ids[0]
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize('rounds', [1, 2, 3, 5])
async def test_demo_round_count_controls_vote_boundary(tmp_path, rounds):
    orch = await make_orchestrator(tmp_path, ['human'] + ['ai'] * 6)
    orch.state.options.discussion_rounds = rounds
    orch.state.players[-1].alive = False
    orch.state.day_index = rounds * 6 - 1
    assert _route_day_discussion({'game': orch.state}) == 'day_discussion'
    orch.state.day_index += 1
    assert _route_day_discussion({'game': orch.state}) == 'start_vote'
