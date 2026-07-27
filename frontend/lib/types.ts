// Mirrors backend/app/models.py -- keep these in sync by hand for now.

export type Role = "werewolf" | "seer" | "doctor" | "villager";
export type Controller = "ai" | "human";
export type Provider = "claude" | "openai" | "gemini" | "ollama" | "mock";

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
}
