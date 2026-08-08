// Mirrors backend/app/models.py -- keep these in sync by hand for now.

export type Role = "werewolf" | "seer" | "doctor" | "villager";
export type Controller = "ai" | "human";
export type Provider = "claude" | "openai" | "gemini" | "ollama" | "ollama_cloud" | "mock";

export interface AgentConfig {
  seat_id: string;
  display_name: string;
  personality: string;
  controller: Controller;
  provider?: Provider | null;
  model_name?: string | null;
  endpoint?: string | null;
}

export interface Player {
  seat_id: string;
  name: string;
  personality: string;
  controller: Controller;
  provider?: Provider | null;
  model_name?: string | null;
  endpoint?: string | null;
  role?: Role | null;
  alive: boolean;
}

export type LogType =
  | "system"
  | "statement"
  | "vote"
  | "death"
  | "winner"
  | "werewolf"
  | "seer"
  | "doctor"
  | "thinking";

export interface LogEntry {
  seq: number;
  round: number;
  phase: string;
  type: LogType;
  seat_id?: string | null;
  name?: string | null;
  text?: string | null;
  thought?: string | null;
  target?: string | null;
  private: boolean;
}

export interface AwaitingInput {
  kind: "statement" | "vote" | "night_action";
  seat_id: string;
  prompt: string;
  options: string[];
}

export interface GameState {
  session_id: string;
  players: Player[];
  round: number;
  phase: string;
  log: LogEntry[];
  seer_knowledge: Record<string, Record<string, Role>>;
  winner: "villagers" | "werewolves" | null;
  awaiting: AwaitingInput | null;
  paused: boolean;
}

export interface TurnEvent {
  seat_id: string | null;
  name: string | null;
}

export interface SeerResultEvent {
  seat_id: string;
  target: string;
  role: Role;
}

export interface GraphNode {
  id: string;
  name: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  conditional: boolean;
}

export interface GraphStructure {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The per-seat agent subgraph (backend/app/game/seat_mind.py) — a second,
   * separate compiled graph, not part of the node list above. Null if the
   * backend was built without one. */
  seat_mind?: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
}

/** Post-game technical report, reconstructed from the LangGraph checkpointer
 * by time travel rather than recorded during play — see
 * backend/app/game/timeline.py. */
export interface TimelineStep {
  step: number;
  next_node: string | null;
  phase: string | null;
  round: number | null;
  alive: number | null;
  log_count: number | null;
  at: string | null;
  elapsed_ms: number | null;
  checkpoint_id: string | null;
  source: string | null;
}

export interface TimelineEvent {
  seq: number;
  round: number;
  phase: string;
  type: string;
  private: boolean;
  text: string;
}

export interface TimelineSeat {
  seat_id: string;
  name: string;
  role: string | null;
  alive: boolean;
  controller: Controller;
  provider: Provider | null;
  model_name: string | null;
  memory_messages: number;
  memory_checkpoints: number;
  turns: number;
}

export interface Timeline {
  session_id: string;
  available: boolean;
  caveat?: string;
  winner?: "villagers" | "werewolves" | null;
  rounds?: number | null;
  phase?: string | null;
  total_steps?: number;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  node_counts?: { node: string; count: number }[];
  phases?: { label: string; phase: string | null; round: number | null; from_step: number }[];
  steps: TimelineStep[];
  events: TimelineEvent[];
  seats: TimelineSeat[];
}

/** Published as each node of a seat's mind subgraph executes, so the debug
 * panel can highlight it the way it already highlights the main graph. */
export interface MindNodeEvent {
  node: string;
  seat_id: string;
  name: string;
}

/** Published after each AI seat's turn, carrying how many messages that
 * seat's persistent conversation now holds. */
export interface MemoryEvent {
  seat_id: string;
  name: string;
  messages: number;
  replayed: boolean;
}

export interface DecisionEvent {
  seat_id: string;
  name: string;
  provider: Provider | null;
  model_name: string | null;
  phase: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated: boolean;
}

export interface SeatMetrics {
  seat_id: string;
  name: string;
  provider: Provider | null;
  model_name: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  last_latency_ms: number;
  estimated: boolean;
  /** Size of this seat's own remembered conversation, from "memory" events.
   * Undefined until that seat has taken its first turn. */
  memory_messages?: number;
}

export interface McpEvent {
  seat_id: string;
  name: string;
  phase: string;
  action: "bind" | "call";
  tool: string | null;
}

/** One line in the debug panel's live activity feed. Built client-side from
 * SSE events that already flow for other reasons ("node" drives the graph
 * highlight, "turn" drives the "X is thinking" indicator, "decision" feeds
 * the metrics table) plus the "mcp" event added specifically for this feed
 * -- see agent_turn.py's orch.publish("mcp", ...) calls. */
export interface ActivityEntry {
  id: number;
  kind: "node" | "turn" | "mcp" | "decision" | "memory";
  text: string;
}
