from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["werewolf", "seer", "doctor", "villager", "hunter", "mayor", "jester"]
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
    "werewolf_negotiation",
    "seer",
    "doctor",
    "thinking",
    "hunter",
    "village_event",
]


class AgentBehavior(BaseModel):
    """Versioned, bounded experiment controls; base safety/role prompts stay intact."""

    version: int = Field(default=1, ge=1, le=10)
    system_prompt_addition: str = Field(default="", max_length=600)
    risk_tolerance: int = Field(default=50, ge=0, le=100)
    honesty: int = Field(default=65, ge=0, le=100)
    aggressiveness: int = Field(default=50, ge=0, le=100)
    reasoning_level: Literal["low", "medium", "high"] = "medium"
    memory_strategy: Literal["recency", "selective", "exhaustive"] = "selective"
    tool_strategy: Literal["cautious", "balanced", "decisive"] = "balanced"
    turn_token_budget: int = Field(default=700, ge=128, le=4096)


class ResiliencePolicy(BaseModel):
    timeout_seconds: int = Field(default=45, ge=3, le=180)
    max_retries: int = Field(default=2, ge=0, le=4)
    retry_backoff_ms: int = Field(default=500, ge=0, le=10_000)
    fallback_provider: Provider | None = None
    fallback_model: str | None = Field(default=None, max_length=160)
    pause_after_exhaustion: bool = True


class GameOptions(BaseModel):
    version: int = Field(default=1, ge=1, le=10)
    role_pack: Literal["standard", "expanded"] = "standard"
    village_events: bool = False
    cross_game_memory: bool = False
    room_name: str = Field(default="The Village", min_length=1, max_length=60)
    max_game_tokens: int = Field(default=500_000, ge=10_000, le=20_000_000)


class VillageEventState(BaseModel):
    kind: Literal["silence", "secret_vote", "forced_testimony", "discovered_evidence"]
    round: int
    target_seat_id: str | None = None
    description: str


class RelationshipMemory(BaseModel):
    id: int
    owner_name: str
    subject_name: str
    memory: str
    source_game_id: str
    source_seq: int | None = None
    active: bool = True
    created_at: str
    edited_at: str | None = None


class AgentConfig(BaseModel):
    """Pre-game seat configuration, submitted by the control panel. Plan §3.1."""

    seat_id: str
    display_name: str
    personality: str
    controller: Controller
    provider: Provider | None = None
    model_name: str | None = None
    endpoint: str | None = None
    behavior: AgentBehavior = Field(default_factory=AgentBehavior)
    resilience: ResiliencePolicy = Field(default_factory=ResiliencePolicy)


class Player(BaseModel):
    seat_id: str
    name: str
    personality: str
    controller: Controller
    provider: Provider | None = None
    model_name: str | None = None
    endpoint: str | None = None
    behavior: AgentBehavior = Field(default_factory=AgentBehavior)
    resilience: ResiliencePolicy = Field(default_factory=ResiliencePolicy)
    cross_game_memories: list[RelationshipMemory] = Field(default_factory=list)
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
    kind: Literal["statement", "vote", "night_action", "werewolf_negotiation", "hunter_action"]
    seat_id: str
    prompt: str
    options: list[str] = Field(default_factory=list)
    turn_id: str | None = None


class GameState(BaseModel):
    """Server-only. Never sent to the frontend in full — see game/views.py. Plan §3.2."""

    session_id: str
    players: list[Player]
    round: int = 1
    phase: Phase = "lobby"
    log: list[LogEntry] = Field(default_factory=list)
    seer_knowledge: dict[str, dict[str, str]] = Field(default_factory=dict)
    winner: Literal["villagers", "werewolves", "jester"] | None = None
    options: GameOptions = Field(default_factory=GameOptions)

    # Orchestration bookkeeping for interrupt-safe graph looping (never leaked
    # to any AgentView — see game/nodes.py for why each of these must only be
    # advanced from inside a single, minimal node execution).
    wolf_index: int = 0
    night_proposals: list[str] = Field(default_factory=list)
    wolf_proposals: dict[str, str] = Field(default_factory=dict)
    wolf_negotiation_commits: dict[int, str] = Field(default_factory=dict)
    night_target: str | None = None
    night_saved: str | None = None
    day_index: int = 0
    vote_index: int = 0
    vote_tally: dict[str, int] = Field(default_factory=dict)
    awaiting: AwaitingInput | None = None
    paused: bool = False
    # Optional deterministic deal used by tournament balance, branching and
    # configurable role packs. Normal games leave this unset and shuffle.
    role_deck: list[Role] | None = None
    hunter_pending: str | None = None
    village_event: VillageEventState | None = None
    event_history: list[VillageEventState] = Field(default_factory=list)
    tokens_used: int = 0

    # seat_id -> the log seq that seat has already been briefed up to. Each AI
    # seat keeps a persistent conversation of its own (see game/seat_mind.py),
    # so on its turn it only needs telling what happened *since it last acted*;
    # this is how the orchestrator knows where that starts. It belongs in
    # GameState precisely so it gets checkpointed and rolled back with
    # everything else -- see nodes.py's `_briefing`.
    seat_log_cursor: dict[str, int] = Field(default_factory=dict)

    def next_seq(self) -> int:
        return len(self.log)

    def alive_players(self) -> list[Player]:
        return [p for p in self.players if p.alive]

    def find_seat(self, seat_id: str) -> Player:
        return next(p for p in self.players if p.seat_id == seat_id)

    def find_by_name(self, name: str) -> Player:
        return next(p for p in self.players if p.name == name)
