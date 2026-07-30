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
  seer_knowledge: Record<string, Record<string, string>>;
  winner: "villagers" | "werewolves" | null;
  awaiting: AwaitingInput | null;
  paused: boolean;
}

export interface TurnEvent {
  seat_id: string | null;
  name: string | null;
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
