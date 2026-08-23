import pytest

from app.game.views import build_human_state_view
from app.models import RelationshipMemory
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_joined_human_view_omits_agent_configuration_and_relationship_memory(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    orch.state.players[2].endpoint = "https://secret-provider.example"
    orch.state.players[2].behavior.system_prompt_addition = "private custom prompt"
    orch.state.players[2].cross_game_memories = [
        RelationshipMemory(
            id=1, owner_name="Elin", subject_name="Mara", memory="private history",
            source_game_id="old-game", active=True, created_at="2026-01-01T00:00:00Z",
        )
    ]

    ordinary = build_human_state_view(orch.state, seat_id="seat_1", host=False)
    dumped = str(ordinary).lower()
    assert "secret-provider" not in dumped
    assert "private custom prompt" not in dumped
    assert "private history" not in dumped
    assert "behavior" not in ordinary["players"][2]
    assert "resilience" not in ordinary["players"][2]

    host = build_human_state_view(orch.state, seat_id="seat_0", host=True)
    assert "behavior" in host["players"][2]
    assert "resilience" in host["players"][2]
    assert "private history" not in str(host).lower()
