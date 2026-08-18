"""The per-seat memory mechanism, tested in isolation from the game graph.

These run against the mock provider, so no API calls happen — but the mock
path deliberately still appends to a seat's conversation (see
agent_turn.py's `_run_mock_turn`), which means the thing under test here is
the real checkpoint-backed memory, not a stub of it.

See docs/concepts/12 and 13 for the full picture. The properties covered are the
ones the design rests on: memory accumulates across turns, it is per-seat rather
than shared, a replayed turn is remembered once but *acted* again, abandoning a
game reclaims its threads, and a finished game can be reconstructed from the
checkpointer after the fact.
"""

import pytest

from app.game.seat_mind import mind_config, remember, run_seat_turn
from app.models import GameState
from tests.helpers import make_orchestrator


async def _assign_roles_only(orch):
    """Roles need to exist before a persona can be built, but we don't want
    the whole game to run -- so drive just the first node by hand."""
    from app.game import nodes

    await nodes.assign_roles({"game": orch.state}, orch.config)


async def _history(orch, seat_id: str):
    snapshot = await orch.seat_mind.aget_state(mind_config(orch.session_id, seat_id))
    return snapshot.values.get("messages") or []


@pytest.mark.asyncio
async def test_memory_accumulates_across_a_seats_turns(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await _assign_roles_only(orch)
    seat = orch.state.players[0]
    pool = [p.name for p in orch.state.players if p.seat_id != seat.seat_id]

    assert await _history(orch, seat.seat_id) == []

    await run_seat_turn(
        orch, seat, phase="day-discuss", briefing="Round 1. Say something.",
        turn_stamp="1:day-discuss:0", commit_tool="submit_statement",
        fallback={"text": "first statement"},
    )
    after_first = await _history(orch, seat.seat_id)

    await run_seat_turn(
        orch, seat, phase="day-vote", briefing="Round 1. Now vote.",
        turn_stamp="1:day-vote:0", commit_tool="submit_vote",
        fallback={"pool": pool},
    )
    after_second = await _history(orch, seat.seat_id)

    # The second turn is a continuation, not a fresh conversation.
    assert len(after_second) > len(after_first)
    texts = [str(m.content) for m in after_second]
    assert any("Say something" in t for t in texts), "first turn's briefing was forgotten"
    assert any("Now vote" in t for t in texts), "second turn's briefing is missing"

    # The persona is seeded exactly once, at the head -- not re-sent per turn.
    system_messages = [m for m in after_second if m.type == "system"]
    assert len(system_messages) == 1
    assert after_second[0].type == "system"
    assert seat.role in str(after_second[0].content)


@pytest.mark.asyncio
async def test_each_seat_keeps_its_own_independent_memory(tmp_path):
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await _assign_roles_only(orch)
    first, second = orch.state.players[0], orch.state.players[1]

    await run_seat_turn(
        orch, first, phase="day-discuss", briefing="Only the first seat hears this.",
        turn_stamp="1:day-discuss:0", commit_tool="submit_statement",
        fallback={"text": "..."},
    )

    first_history = await _history(orch, first.seat_id)
    second_history = await _history(orch, second.seat_id)

    assert any("Only the first seat" in str(m.content) for m in first_history)
    assert second_history == [], "one seat's turn leaked into another seat's memory"


@pytest.mark.asyncio
async def test_replayed_turn_does_not_duplicate_memory(tmp_path):
    """The guard against the pause/resume replay described in seat_mind.py's
    `_ingest`: the main graph re-runs a node from the top after an interrupt,
    and a seat's memory lives in a checkpoint thread that rollback doesn't
    touch, so without the turn stamp the same turn would be remembered twice.
    """
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await _assign_roles_only(orch)
    seat = orch.state.players[0]

    # A day statement rather than a night action: every seat can always make
    # one, whereas night actions depend on the role this seat happened to draw.
    first_result = await run_seat_turn(
        orch, seat, phase="day-discuss", briefing="Round 1. Say something.",
        turn_stamp="1:day-discuss:0", commit_tool="submit_statement",
        fallback={"text": "only once"},
    )
    after_first = await _history(orch, seat.seat_id)

    # Same stamp == the same turn being lived again after a resume.
    replay_result = await run_seat_turn(
        orch, seat, phase="day-discuss", briefing="Round 1. Say something.",
        turn_stamp="1:day-discuss:0", commit_tool="submit_statement",
        fallback={"text": "only once"},
    )
    after_replay = await _history(orch, seat.seat_id)

    assert len(after_replay) == len(after_first), "replayed turn appended a duplicate exchange"
    assert replay_result == first_result, "replay should hand back the original decision"

    # A genuinely new turn still gets through -- the guard is stamp-specific,
    # not a blanket "only one turn ever" lock.
    await run_seat_turn(
        orch, seat, phase="day-vote", briefing="Round 1. Now vote.",
        turn_stamp="1:day-vote:0", commit_tool="submit_vote",
        fallback={"pool": [p.name for p in orch.state.players if p.seat_id != seat.seat_id]},
    )
    assert len(await _history(orch, seat.seat_id)) > len(after_replay)


@pytest.mark.asyncio
async def test_replayed_turn_reapplies_the_action_to_rolled_back_state(tmp_path):
    """The other half of the replay guard, and a bug it originally caused.

    Skipping the *memory* write on a replay is right; skipping the *game
    action* is not. GameState is rolled back to the pre-node checkpoint when a
    pause interrupts, so the effect of the first attempt is gone — and the
    first version of this guard returned the cached result without re-applying
    it, which silently dropped the paused seat's vote."""
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await _assign_roles_only(orch)
    seat = orch.state.players[0]
    pool = [p.name for p in orch.state.players if p.seat_id != seat.seat_id]

    first = await run_seat_turn(
        orch, seat, phase="day-vote", briefing="Cast your vote.",
        turn_stamp="1:day-vote:0", commit_tool="submit_vote", fallback={"pool": pool},
    )
    assert orch.state.vote_tally, "the first attempt should have registered a vote"
    tally_before = dict(orch.state.vote_tally)
    history_before = await _history(orch, seat.seat_id)

    # Exactly what resume does: hand the node a fresh GameState deserialized
    # from the checkpoint taken *before* the node ran, so the vote is absent.
    orch.state = GameState(**{**orch.state.model_dump(), "vote_tally": {}})
    assert orch.state.vote_tally == {}

    replay = await run_seat_turn(
        orch, seat, phase="day-vote", briefing="Cast your vote.",
        turn_stamp="1:day-vote:0", commit_tool="submit_vote", fallback={"pool": pool},
    )

    assert orch.state.vote_tally == tally_before, "replayed turn did not re-apply the vote"
    assert replay == first, "replay should reproduce the original decision, not a fresh one"
    # ...and still without remembering the turn a second time.
    assert len(await _history(orch, seat.seat_id)) == len(history_before)


@pytest.mark.asyncio
async def test_discarding_a_game_reclaims_every_seats_checkpoint_thread(tmp_path):
    """One game owns eight checkpoint threads (its own plus one per seat), so
    abandoning games without reclaiming them grows village.db forever."""
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task

    cursor = await orch.conn.execute("SELECT COUNT(DISTINCT thread_id) FROM checkpoints")
    before = (await cursor.fetchone())[0]
    assert before > 1, "expected the game graph plus per-seat mind threads"

    await orch.discard_checkpoints()

    cursor = await orch.conn.execute("SELECT COUNT(DISTINCT thread_id) FROM checkpoints")
    assert (await cursor.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_log_rows_are_idempotent_on_seq(tmp_path):
    """A replayed node re-appends log entries with the same seq. The in-memory
    log is rolled back so that recomputes cleanly, but rows already written are
    not — hence the dedup in persistence.record_log_entry."""
    from app import persistence
    from app.models import LogEntry

    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    entry = LogEntry(seq=0, round=1, phase="night", type="system", text="Night falls.")

    await persistence.record_log_entry(orch.conn, orch.session_id, entry)
    await persistence.record_log_entry(orch.conn, orch.session_id, entry)

    cursor = await orch.conn.execute(
        "SELECT COUNT(*) FROM log_entries WHERE game_id = ? AND seq = ?",
        (orch.session_id, 0),
    )
    assert (await cursor.fetchone())[0] == 1


@pytest.mark.asyncio
async def test_remember_appends_without_invoking_the_model(tmp_path):
    """Outcome deltas are written straight into a seat's conversation, with no
    model call -- that's what makes per-round reflection affordable."""
    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    await _assign_roles_only(orch)
    seat = orch.state.players[0]

    await run_seat_turn(
        orch, seat, phase="day-discuss", briefing="Round 1. Say something.",
        turn_stamp="1:day-discuss:0", commit_tool="submit_statement",
        fallback={"text": "..."},
    )
    before = await _history(orch, seat.seat_id)
    decisions_before = await _decision_count(orch, seat.seat_id)

    await remember(orch, seat.seat_id, "The village cast out Bram — he was a villager.")

    after = await _history(orch, seat.seat_id)
    assert len(after) == len(before) + 1
    assert "cast out Bram" in str(after[-1].content)
    # No turn was taken, so no decision should have been recorded.
    assert await _decision_count(orch, seat.seat_id) == decisions_before


async def _decision_count(orch, seat_id: str) -> int:
    cursor = await orch.conn.execute(
        "SELECT COUNT(*) FROM agent_decisions WHERE game_id = ? AND seat_id = ?",
        (orch.session_id, seat_id),
    )
    row = await cursor.fetchone()
    return row[0]


@pytest.mark.asyncio
async def test_timeline_reconstructs_the_game_from_checkpoints(tmp_path):
    """The post-game report is read back out of the checkpointer, not recorded
    during play -- see docs/concepts/13. Checks the facts that come from the
    checkpoint history (node order and counts) and the ones that come from the
    log (narrative, turn counts), since the two are deliberately separate."""
    from app.game import timeline

    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task

    report = await timeline.build_timeline(orch.graph, orch.seat_mind, orch.session_id, orch.conn)

    assert report["available"] is True
    assert report["winner"] == orch.state.winner
    assert report["total_steps"] > 10
    assert report["caveat"]

    # The conditional self-edges show up as repeat executions of one node.
    counts = {row["node"]: row["count"] for row in report["node_counts"]}
    assert counts["assign_roles"] == 1
    assert counts.get("day_discussion", 0) > 1, "the self-edge should have looped"

    # Execution starts where the graph says it does, and the lobby is a real
    # checkpoint the graph waited at rather than an absence.
    assert report["steps"][0]["next_node"] == "assign_roles"
    assert report["steps"][0]["phase"] == "lobby"

    # Narrative comes from the log, so it matches it exactly.
    assert len(report["events"]) == len(orch.state.log)

    # Per-seat turn counts come from the log; memory depth from the mind thread.
    assert len(report["seats"]) == 7
    actor = max(report["seats"], key=lambda s: s["turns"])
    assert actor["turns"] > 0
    assert actor["memory_messages"] > 0

    # The learner-facing debrief is derived from the same durable evidence:
    # model decisions/tool results, public/private logs, and seat checkpoints.
    debrief = report["learning_debrief"]
    assert debrief["tool_totals"]["accepted"] > 0
    assert debrief["tool_totals"]["rejected"] == 0
    assert debrief["partial_observability"]["public_events"] > 0
    assert debrief["partial_observability"]["private_events"] > 0
    assert len(debrief["memories"]) == 7
    assert any(memory["growth"] > 0 for memory in debrief["memories"])
    assert len(debrief["belief_evolution"]) > 0
    assert len(report["belief_events"]) == len(debrief["belief_evolution"])
    assert len(debrief["concept_evidence"]) >= 5
    assert len(debrief["next_experiments"]) >= 3


@pytest.mark.asyncio
async def test_timeline_of_a_discarded_game_reports_unavailable(tmp_path):
    """Abandoning a game reclaims its checkpoint threads on purpose, so there is
    genuinely no history left -- that's a normal answer, not an error."""
    from app.game import timeline

    orch = await make_orchestrator(tmp_path, ["ai"] * 7)
    orch.start()
    await orch._task
    await orch.discard_checkpoints()

    report = await timeline.build_timeline(orch.graph, orch.seat_mind, orch.session_id)
    assert report["available"] is False
    assert report["steps"] == []
