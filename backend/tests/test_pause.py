"""Pause/continue reuses the human-in-the-loop interrupt mechanism (see
game/nodes.py's `_maybe_pause`) rather than adding a second suspend path.
These tests cover the two things that actually matter: that pausing really
suspends the graph and resuming really continues it, and — the subtle part
— that a pause requested while a human turn is already pending doesn't
steal that human's answer. See docs/concepts/07-pausing-with-interrupt.md
for the full failure mode this guards against.
"""

import pytest

from tests.helpers import answer_for, make_orchestrator


@pytest.mark.asyncio
async def test_pause_before_start_suspends_immediately_after_first_node(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.request_pause()

    orch.start()
    await orch._task

    # assign_roles is the very first node -- pausing before start means the
    # graph should suspend right after it, before any night action.
    assert orch.state.paused is True
    assert orch.state.awaiting is None
    assert orch.state.winner is None
    assert all(p.role is not None for p in orch.state.players)  # assign_roles did run
    assert orch.state.log[-1].type == "system"  # no night/day activity logged yet

    orch.continue_game()
    await orch._task
    while orch.state.awaiting is not None:  # drain any human turns (none here -- all mock)
        orch.resume(answer_for(orch.state.awaiting))
        await orch._task

    assert orch.state.paused is False
    assert orch.state.winner in ("villagers", "werewolves")


@pytest.mark.asyncio
async def test_pause_requested_after_game_ends_is_a_harmless_no_op(tmp_path):
    # An all-mock game has no human turn to suspend on, so it runs to
    # completion in a single _run() call -- there's no "middle" to catch it
    # at (that scenario needs a human seat; see the test below). This just
    # confirms requesting a pause against a finished game doesn't misfire.
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task

    orch.request_pause()
    assert orch.state.paused is False  # nothing left to run -- request just sits unused
    assert orch.state.winner is not None


@pytest.mark.asyncio
async def test_pause_requested_during_pending_human_turn_does_not_steal_the_answer(tmp_path):
    """The regression test for the ordering pitfall `_maybe_pause` is
    designed around: request a pause *while* a human `interrupt()` is
    already suspended and unanswered, then resume with the human's real
    answer. The human's answer must still be applied correctly, and the
    pause must take effect *after* it -- not consume it."""
    orch = await make_orchestrator(tmp_path, ["human"] + ["ai"] * 6)
    orch.start()
    await orch._task

    interrupted = False
    while orch.state.awaiting is not None:
        awaiting = orch.state.awaiting
        assert awaiting.seat_id == "seat_0"
        interrupted = True

        # Pause is requested *while* this human interrupt is pending --
        # exactly the dangerous ordering case.
        orch.request_pause()
        answer = answer_for(awaiting)
        log_len_before = len(orch.state.log)

        orch.resume(answer)
        await orch._task

        # The human's answer must have been applied: a new log entry from
        # seat_0 exists (statement/vote/night action), not silently dropped.
        seat_0_entries_after = [e for e in orch.state.log[log_len_before:] if e.seat_id == "seat_0"]
        assert seat_0_entries_after, "the human's answer never got applied -- pause stole it"

        # And the pause -- requested after the human's own interrupt was
        # already pending -- must still have taken effect right after,
        # not been silently dropped either.
        assert orch.state.paused is True
        assert orch.state.awaiting is None

        # Drain the pause and keep going until either the next human turn
        # or the game ends.
        orch.continue_game()
        await orch._task
        break  # one round-trip is enough to prove the ordering is safe

    if not interrupted:
        pytest.skip("human seat never got a turn this run (died before acting) -- nothing to test")

    # Drive the rest of the game to completion normally.
    while orch.state.awaiting is not None:
        orch.resume(answer_for(orch.state.awaiting))
        await orch._task
    assert orch.state.winner in ("villagers", "werewolves")
