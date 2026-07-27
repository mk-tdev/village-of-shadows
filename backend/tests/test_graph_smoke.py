import pytest

from tests.helpers import answer_for, make_orchestrator


@pytest.mark.asyncio
async def test_all_mock_game_runs_to_a_winner(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task

    assert orch.state.winner in ("villagers", "werewolves")
    assert orch.state.awaiting is None

    cur = await orch.conn.execute("SELECT status, winner FROM games WHERE id = ?", (orch.session_id,))
    row = await cur.fetchone()
    assert row == ("finished", orch.state.winner)

    cur = await orch.conn.execute("SELECT COUNT(*) FROM seats WHERE game_id = ? AND role IS NOT NULL", (orch.session_id,))
    assert (await cur.fetchone())[0] == 7

    cur = await orch.conn.execute("SELECT COUNT(*) FROM log_entries WHERE game_id = ?", (orch.session_id,))
    assert (await cur.fetchone())[0] > 0

    cur = await orch.conn.execute("SELECT COUNT(*) FROM agent_decisions WHERE game_id = ?", (orch.session_id,))
    assert (await cur.fetchone())[0] > 0

    from app.game import actions
    await actions.write_note(orch, "seat_0", "a test note")
    cur = await orch.conn.execute("SELECT COUNT(*) FROM agent_notes WHERE game_id = ?", (orch.session_id,))
    assert (await cur.fetchone())[0] == 1


@pytest.mark.asyncio
async def test_human_seat_interrupts_and_resumes_to_completion(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.start()
    await orch._task

    rounds_of_input = 0
    while orch.state.awaiting is not None:
        rounds_of_input += 1
        assert rounds_of_input < 50, "test did not converge — likely an interrupt-loop bug"
        awaiting = orch.state.awaiting
        assert awaiting.seat_id == "seat_0"
        orch.resume(answer_for(awaiting))
        await orch._task

    assert rounds_of_input > 0, "the human seat should have been interrupted at least once"
    assert orch.state.winner in ("villagers", "werewolves")
