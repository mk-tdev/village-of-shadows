from datetime import UTC, datetime, timedelta

import pytest

from app import persistence
from app.game import sharing
from app.models import LogEntry
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_public_replay_is_immutable_and_excludes_private_material(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.winner = "villagers"
    orch.state.players[0].role = "seer"
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="day-discuss", type="statement", seat_id="seat_0", text="Public words", private=False),
        LogEntry(seq=1, round=1, phase="night", type="seer", seat_id="seat_0", text="Secret result", private=True),
    ]
    result = await sharing.create_share(
        graph=orch.graph, seat_mind=orch.seat_mind, conn=orch.conn,
        state=orch.state, scope="public", expires_in_hours=24,
    )
    resolved = await sharing.resolve_share(orch.conn, result["share_id"], None)
    assert resolved is not None
    serialized = str(resolved["snapshot"]).lower()
    assert "public words" in serialized
    assert "secret result" not in serialized
    assert "endpoint" not in serialized
    assert "api_key" not in serialized
    assert "checkpoint_id" not in serialized

    orch.state.log[0].text = "Mutated live state"
    resolved_again = await sharing.resolve_share(orch.conn, result["share_id"], None)
    assert resolved_again["snapshot"]["events"][0]["text"] == "Public words"


@pytest.mark.asyncio
async def test_god_replay_requires_secret_and_can_expire_or_be_revoked(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.state.winner = "werewolves"
    orch.state.log = [
        LogEntry(seq=0, round=1, phase="night", type="werewolf", text="Private pack plan", private=True),
    ]
    result = await sharing.create_share(
        graph=orch.graph, seat_mind=orch.seat_mind, conn=orch.conn,
        state=orch.state, scope="god", expires_in_hours=24,
    )
    assert await sharing.resolve_share(orch.conn, result["share_id"], None) is None
    resolved = await sharing.resolve_share(orch.conn, result["share_id"], result["secret"])
    assert "Private pack plan" in str(resolved["snapshot"])

    assert await persistence.revoke_replay_share(orch.conn, orch.session_id, result["share_id"])
    assert await sharing.resolve_share(orch.conn, result["share_id"], result["secret"]) is None

    expired_id = "expired-share"
    await persistence.create_replay_share(
        orch.conn,
        share_id=expired_id,
        game_id=orch.session_id,
        scope="public",
        secret_hash=None,
        snapshot={"safe": True},
        expires_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    )
    assert await sharing.resolve_share(orch.conn, expired_id, None) is None
