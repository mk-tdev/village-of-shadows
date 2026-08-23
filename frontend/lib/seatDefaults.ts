import type { SelectOption } from "@/components/Select";
import type { AgentConfig, Provider } from "./types";
import type { AgentBehavior, ResiliencePolicy } from "./types";

export const DEFAULT_BEHAVIOR: AgentBehavior = {
  version: 1,
  system_prompt_addition: "",
  risk_tolerance: 50,
  honesty: 65,
  aggressiveness: 50,
  reasoning_level: "medium",
  memory_strategy: "selective",
  tool_strategy: "balanced",
  turn_token_budget: 700,
};

export const DEFAULT_RESILIENCE: ResiliencePolicy = {
  timeout_seconds: 45,
  max_retries: 2,
  retry_backoff_ms: 500,
  fallback_provider: null,
  fallback_model: null,
  pause_after_exhaustion: true,
};

export const DEFAULT_NAMES = ["Mara", "Tomas", "Elin", "Bram", "Sable", "Corvin", "Petra"];
export const DEFAULT_PERSONALITIES = [
  "sharp-eyed",
  "hot-headed",
  "anxious",
  "easygoing",
  "sly",
  "stoic",
  "curious",
];

/** Curated suggestions: every listed family is documented by its provider as
 * supporting both reasoning/thinking and tool calling. The combobox also
 * accepts custom IDs because provider and local catalogs evolve; the setup
 * preflight proves the exact entered ID can answer and call a tool before it
 * creates a game. */
export const PROVIDER_MODEL_SUGGESTIONS: Record<Provider, SelectOption[]> = {
  mock: [{ value: "mock-v1", label: "mock-v1", sublabel: "offline / no key needed" }],

  claude: [
    { value: "claude-fable-5", label: "Claude Fable 5", sublabel: "adaptive thinking · tools" },
    { value: "claude-opus-5", label: "Claude Opus 5", sublabel: "adaptive thinking · tools" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5", sublabel: "adaptive thinking · tools" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", sublabel: "extended thinking · tools" },
  ],

  openai: [
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol", sublabel: "reasoning · function calling" },
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra", sublabel: "reasoning · function calling" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna", sublabel: "reasoning · function calling" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", sublabel: "reasoning · function calling" },
    { value: "gpt-5.4-nano", label: "GPT-5.4 Nano", sublabel: "reasoning · function calling" },
  ],

  gemini: [
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", sublabel: "thinking · function calling" },
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", sublabel: "thinking · function calling" },
    { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", sublabel: "thinking · function calling" },
  ],

  ollama: [
    { value: "gpt-oss:20b", label: "gpt-oss:20b", sublabel: "thinking · tools" },
    { value: "gpt-oss:120b", label: "gpt-oss:120b", sublabel: "thinking · tools" },
    { value: "qwen3:4b", label: "qwen3:4b", sublabel: "thinking · tools" },
    { value: "qwen3:8b", label: "qwen3:8b", sublabel: "thinking · tools" },
    { value: "qwen3:14b", label: "qwen3:14b", sublabel: "thinking · tools" },
  ],

  // Ollama Cloud (ollama.com's hosted models) -- not a local server, needs
  // OLLAMA_API_KEY set in backend/.env. Unlike a guessed "-cloud"-suffixed
  // name, every value below was pulled live from a real account's
  // GET https://ollama.com/api/tags and confirmed working against
  // POST /api/chat (a "-cloud" suffix is only a valid alias for a handful
  // of models, like gpt-oss, that also exist as local pulls -- most cloud
  // models are just their plain name, and guessing wrong 410s instead of
  // giving a useful error). The list is only a set of suggestions because
  // ollama.com's catalog changes over time; custom IDs remain editable, and
  // the readiness check blocks retired or inaccessible entries before play.
  ollama_cloud: [
    { value: "gpt-oss:20b", label: "gpt-oss:20b", sublabel: "thinking · tools" },
    { value: "gpt-oss:120b", label: "gpt-oss:120b", sublabel: "thinking · tools" },
  ],
};

/** Shared by SeatRow's per-seat provider picker and the setup page's
 * "apply to all AI seats" master picker -- one list, so the two can never
 * drift apart. */
export const PROVIDER_OPTIONS: SelectOption[] = [
  { value: "mock", label: "mock", sublabel: "offline" },
  { value: "claude", label: "Claude" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama", sublabel: "local server" },
  { value: "ollama_cloud", label: "Ollama Cloud", sublabel: "hosted, needs OLLAMA_API_KEY" },
];

export function defaultSeats(humanIndex: number): AgentConfig[] {
  return DEFAULT_NAMES.map((name, i) => ({
    seat_id: `seat_${i}`,
    display_name: name,
    personality: DEFAULT_PERSONALITIES[i],
    controller: i === humanIndex ? "human" : "ai",
    provider: i === humanIndex ? null : "mock",
    model_name: i === humanIndex ? null : "mock-v1",
    endpoint: null,
    behavior: { ...DEFAULT_BEHAVIOR },
    resilience: { ...DEFAULT_RESILIENCE },
  }));
}
