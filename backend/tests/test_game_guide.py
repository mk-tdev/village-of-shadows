from app.routers.guide import _answer


def _view():
    return {
        "access": {"seat_id": "seat_0"},
        "round": 2,
        "phase": "day-discuss",
        "awaiting": None,
        "players": [
            {"seat_id": "seat_0", "name": "Mara", "role": "seer", "alive": True},
            {"seat_id": "seat_1", "name": "Tomas", "role": None, "alive": True},
            {"seat_id": "seat_2", "name": "Elin", "role": "villager", "alive": False},
        ],
        "log": [
            {"text": "Mara says Tomas seems evasive."},
            {"text": "Elin was eliminated."},
        ],
    }


def test_guide_refuses_off_topic_questions():
    answer = _answer("What is the weather in Singapore?", _view())
    assert answer.startswith("I can only help with this Village of Shadows game")


def test_guide_uses_only_the_player_filtered_game_view():
    assert "round 2" in _answer("What is the current game phase?", _view())
    assert "You are the seer" in _answer("What is my role?", _view())
    assert "Tomas" in _answer("Who is alive in the village?", _view())
    # Tomas's role is absent in this player-filtered projection and must not
    # be invented by the helper.
    assert "secret" not in _answer("Who is alive in the village?", _view()).lower()
