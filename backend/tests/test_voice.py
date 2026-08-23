import pytest

from app import persistence
from app.game import voice
from app.models import LogEntry
from tests.helpers import make_orchestrator


@pytest.mark.asyncio
async def test_public_statement_audio_is_generated_once_then_cached(tmp_path, monkeypatch):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    entry = LogEntry(
        seq=7, round=1, phase="day-discuss", type="statement",
        seat_id="seat_1", text="The old well remembers what we have forgotten.", private=False,
    )
    await persistence.record_log_entry(orch.conn, orch.session_id, entry)
    calls = []

    async def fake_synthesize(line, selected_voice, model):
        calls.append((line, selected_voice, model))
        return b"ancient-voice", "audio/mpeg"

    monkeypatch.setattr(voice, "synthesize_openai", fake_synthesize)
    first = await voice.get_or_create_council_audio(orch.conn, orch.session_id, entry.seq)
    second = await voice.get_or_create_council_audio(orch.conn, orch.session_id, entry.seq)

    assert first == second == (b"ancient-voice", "audio/mpeg")
    assert len(calls) == 1
    assert calls[0][0].text == entry.text
    assert "never like a cartoon" in voice.ancient_performance(calls[0][0])


@pytest.mark.asyncio
async def test_private_or_non_statement_events_can_never_be_voiced(tmp_path):
    orch = await make_orchestrator(tmp_path, ["human", "human"] + ["ai"] * 5)
    for seq, event_type, private in ((2, "seer", True), (3, "system", False)):
        await persistence.record_log_entry(
            orch.conn,
            orch.session_id,
            LogEntry(
                seq=seq, round=1, phase="night", type=event_type,
                seat_id="seat_0", text="This must not become audio.", private=private,
            ),
        )
        with pytest.raises(voice.VoiceLineNotFoundError):
            await voice.get_or_create_council_audio(orch.conn, orch.session_id, seq)
