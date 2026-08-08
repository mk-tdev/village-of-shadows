from __future__ import annotations

from langchain_core.messages import AIMessage
import pytest

from app import model_preflight
from app import adapters
from app.models import AgentConfig


def _config(seat_id: str = "seat_0", model_name: str = "model-ready") -> AgentConfig:
    return AgentConfig(
        seat_id=seat_id,
        display_name=seat_id,
        personality="careful",
        controller="ai",
        provider="ollama",
        model_name=model_name,
        endpoint="http://model.test",
    )


def test_openai_reasoning_models_use_responses_api(monkeypatch):
    config = _config(model_name="gpt-5.6-terra")
    config.provider = "openai"
    config.endpoint = None
    monkeypatch.setattr(adapters.settings, "openai_api_key", "test-key")

    model = adapters.get_chat_model(config)

    assert model.use_responses_api is True


class _FakeBoundModel:
    def __init__(self, response: AIMessage | Exception):
        self.response = response

    async def ainvoke(self, _messages):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class _FakeModel:
    def __init__(self, response: AIMessage | Exception):
        self.response = response
        self.bind_count = 0

    def bind_tools(self, tools):
        assert [tool.name for tool in tools] == ["confirm_game_model"]
        self.bind_count += 1
        return _FakeBoundModel(self.response)


@pytest.mark.asyncio
async def test_preflight_requires_the_bound_tool_call(monkeypatch):
    model = _FakeModel(
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "confirm_game_model",
                    "args": {"code": "ready"},
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        )
    )
    monkeypatch.setattr(model_preflight, "get_chat_model", lambda _config: model)

    result = await model_preflight.preflight_models([_config()])

    assert result.ok is True
    assert result.results[0].ok is True
    assert result.results[0].message == "Message and tool call succeeded."


@pytest.mark.asyncio
async def test_text_only_response_fails_even_when_model_answers(monkeypatch):
    model = _FakeModel(AIMessage(content="ready"))
    monkeypatch.setattr(model_preflight, "get_chat_model", lambda _config: model)

    result = await model_preflight.preflight_models([_config()])

    assert result.ok is False
    assert "did not call" in result.results[0].message


@pytest.mark.asyncio
async def test_provider_error_is_returned_per_seat(monkeypatch):
    model = _FakeModel(RuntimeError("model does not exist"))
    monkeypatch.setattr(model_preflight, "get_chat_model", lambda _config: model)

    result = await model_preflight.preflight_models([_config()])

    assert result.ok is False
    assert result.results[0].message == "model does not exist"


@pytest.mark.asyncio
async def test_duplicate_configuration_is_only_contacted_once(monkeypatch):
    model = _FakeModel(
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "confirm_game_model",
                    "args": {"code": "ready"},
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        )
    )
    monkeypatch.setattr(model_preflight, "get_chat_model", lambda _config: model)

    result = await model_preflight.preflight_models([_config("seat_0"), _config("seat_1")])

    assert result.ok is True
    assert len(result.results) == 2
    assert model.bind_count == 1


@pytest.mark.asyncio
async def test_mock_and_human_seats_do_not_make_provider_calls(monkeypatch):
    def fail_if_called(_config):
        raise AssertionError("mock/human must not create a chat model")

    monkeypatch.setattr(model_preflight, "get_chat_model", fail_if_called)
    mock = _config()
    mock.provider = "mock"
    mock.model_name = "mock-v1"
    human = AgentConfig(
        seat_id="seat_1",
        display_name="Human",
        personality="curious",
        controller="human",
    )

    result = await model_preflight.preflight_models([mock, human])

    assert result.ok is True
    assert [item.seat_id for item in result.results] == ["seat_0"]
