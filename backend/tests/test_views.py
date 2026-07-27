from app.game.views import build_agent_view
from app.models import GameState, LogEntry, Player


def _game() -> GameState:
    players = [
        Player(seat_id="s1", name="Mara", personality="sly", controller="ai", role="werewolf"),
        Player(seat_id="s2", name="Tomas", personality="stoic", controller="ai", role="werewolf"),
        Player(seat_id="s3", name="Elin", personality="anxious", controller="ai", role="seer"),
        Player(seat_id="s4", name="Bram", personality="easygoing", controller="human", role="villager"),
    ]
    state = GameState(session_id="g1", players=players, round=1, phase="night")
    state.log.append(
        LogEntry(seq=0, round=1, phase="night", type="werewolf", seat_id="s1", text="proposes attacking Bram", private=True)
    )
    state.log.append(
        LogEntry(seq=1, round=1, phase="day-discuss", type="statement", seat_id="s4", text="I trust no one.", private=False)
    )
    state.seer_knowledge["s3"] = {"Mara": "werewolf"}
    return state


def test_public_transcript_excludes_private_entries():
    state = _game()
    view = build_agent_view(state, "s4")
    texts = [e["text"] for e in view["public_transcript"]]
    assert "I trust no one." in texts
    assert "proposes attacking Bram" not in texts


def test_villager_view_has_no_teammate_or_seer_fields():
    state = _game()
    view = build_agent_view(state, "s4")
    assert "teammate" not in view
    assert "known_roles" not in view


def test_werewolf_sees_only_their_own_teammate():
    state = _game()
    view = build_agent_view(state, "s1")
    assert view["teammate"] == "Tomas"
    assert "known_roles" not in view


def test_seer_sees_only_their_own_knowledge():
    state = _game()
    view = build_agent_view(state, "s3")
    assert view["known_roles"] == {"Mara": "werewolf"}

    other_seer_seat_has_nothing = build_agent_view(state, "s4")
    assert "known_roles" not in other_seer_seat_has_nothing


def test_dead_werewolf_teammate_reported_as_none():
    state = _game()
    state.find_seat("s2").alive = False
    view = build_agent_view(state, "s1")
    assert view["teammate"] is None
