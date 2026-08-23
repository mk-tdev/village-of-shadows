import pytest
from langchain_core.messages import AIMessage

from app.game.agent_turn import _invoke_with_retry


class FlakyModel:
    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError("transient provider failure")
        return AIMessage(content="recovered")


@pytest.mark.asyncio
async def test_generation_retries_before_any_tool_action():
    model = FlakyModel(failures=2)
    retries = []
    result = await _invoke_with_retry(
        model, [], timeout_seconds=3, max_retries=2, backoff_ms=0,
        on_retry=lambda attempt, message: retries.append((attempt, message)),
    )
    assert result.content == "recovered"
    assert model.calls == 3
    assert [attempt for attempt, _ in retries] == [1, 2]


@pytest.mark.asyncio
async def test_generation_stops_after_bounded_attempts():
    model = FlakyModel(failures=10)
    with pytest.raises(RuntimeError, match="transient"):
        await _invoke_with_retry(
            model, [], timeout_seconds=3, max_retries=1, backoff_ms=0,
            on_retry=lambda *_: None,
        )
    assert model.calls == 2
