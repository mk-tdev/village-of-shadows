from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["werewolf", "seer", "doctor", "villager"]
Controller = Literal["ai", "human"]
Provider = Literal["claude", "openai", "gemini", "ollama", "ollama_cloud", "mock"]
Phase = Literal[
    "lobby",
    "night",
    "day-discuss",
    "day-vote",
    "gameover",
]
LogType = Literal[
    "system",
    "statement",
    "vote",
    "death",
    "winner",
    "werewolf",
    "seer",
    "doctor",
    "thinking",
]


class AgentConfig(BaseModel):
    """Pre-game seat configuration, submitted by the control panel. Plan §3.1."""

    seat_id: str
    display_name: str
    personality: str
    controller: Controller
    provider: Provider | None = None
    model_name: str | None = None
    endpoint: str | None = None


class Player(BaseModel):
    seat_id: str
    name: str
    personality: str
    controller: Controller
    provider: Provider | None = None
    model_name: str | None = None
    endpoint: str | None = None
    role: Role | None = None
    alive: bool = True


class LogEntry(BaseModel):
    seq: int
    round: int
    phase: str
    type: LogType
    seat_id: str | None = None
    name: str | None = None
    text: str | None = None
    thought: str | None = None
    target: str | None = None
    private: bool = False


class AwaitingInput(BaseModel):
    kind: Literal["statement", "vote", "night_action"]
    seat_id: str
    prompt: str
    options: list[str] = Field(default_factory=list)


class GameState(BaseModel):
    """Server-only. Never sent to the frontend in full — see game/views.py. Plan §3.2."""

    session_id: str
    players: list[Player]
    round: int = 1
    phase: Phase = "lobby"
    log: list[LogEntry] = Field(default_factory=list)
    seer_knowledge: dict[str, dict[str, str]] = Field(default_factory=dict)
    winner: Literal["villagers", "werewolves"] | None = None

    # Orchestration bookkeeping for interrupt-safe graph looping (never leaked
    # to any AgentView — see game/nodes.py for why each of these must only be
    # advanced from inside a single, minimal node execution).
    wolf_index: int = 0
    night_proposals: list[str] = Field(default_factory=list)
    night_saved: str | None = None
    day_index: int = 0
    vote_index: int = 0
    vote_tally: dict[str, int] = Field(default_factory=dict)
    awaiting: AwaitingInput | None = None
    paused: bool = False

    def next_seq(self) -> int:
        return len(self.log)

    def alive_players(self) -> list[Player]:
        return [p for p in self.players if p.alive]

    def find_seat(self, seat_id: str) -> Player:
        return next(p for p in self.players if p.seat_id == seat_id)

    def find_by_name(self, name: str) -> Player:
        return next(p for p in self.players if p.name == name)
