import type { SelectOption } from "@/components/Select";
import type { AgentConfig, Provider } from "./types";

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

/**
 * Model suggestions per provider -- a convenience list, not a closed set
 * (plan §8: "any model the account/endpoint supports" stays valid via
 * free-text in the Combobox). Claude IDs and pricing/thinking-support tiers
 * are verified against Anthropic's own current model catalog. OpenAI and
 * Gemini don't have an equivalent live source wired into this session, so
 * treat those two lists as best-effort -- double check current IDs/pricing
 * against each provider's own docs before relying on them.
 */
export const PROVIDER_MODEL_SUGGESTIONS: Record<Provider, SelectOption[]> = {
  mock: [{ value: "mock-v1", label: "mock-v1", sublabel: "offline / no key needed" }],

  claude: [
    { value: "claude-opus-5", label: "Claude Opus 5", sublabel: "flagship · thinking · $5/$25 per MTok" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5", sublabel: "balanced · thinking · $3/$15 per MTok" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", sublabel: "cheapest · fastest · $1/$5 per MTok" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8", sublabel: "prev-gen flagship · thinking · $5/$25" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", sublabel: "prev-gen balanced · thinking · $3/$15" },
    { value: "claude-fable-5", label: "Claude Fable 5", sublabel: "most capable · thinking always on · $10/$50" },
  ],

  // Best-effort — verify against platform.openai.com/docs before shipping.
  openai: [
    { value: "gpt-5.1", label: "GPT-5.1", sublabel: "flagship (verify current ID)" },
    { value: "gpt-5.1-mini", label: "GPT-5.1 Mini", sublabel: "cheaper (verify current ID)" },
    { value: "gpt-5.1-nano", label: "GPT-5.1 Nano", sublabel: "cheapest (verify current ID)" },
    { value: "o4-mini", label: "o4-mini", sublabel: "reasoning / thinking model" },
    { value: "o3", label: "o3", sublabel: "reasoning / thinking, higher cost" },
  ],

  // Best-effort — verify against ai.google.dev/gemini-api/docs/models before shipping.
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", sublabel: "flagship · thinking built-in" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", sublabel: "balanced · thinking built-in" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", sublabel: "cheapest / fastest" },
  ],

  ollama: [
    { value: "gemma4:latest", label: "gemma4:latest", sublabel: "tool-calling · your local pull" },
    { value: "llama3.1", label: "llama3.1", sublabel: "general purpose" },
    { value: "qwen2.5:14b", label: "qwen2.5:14b", sublabel: "general purpose, larger" },
    { value: "qwen2.5:7b", label: "qwen2.5:7b", sublabel: "cheaper / smaller" },
    { value: "deepseek-r1:7b", label: "deepseek-r1:7b", sublabel: "reasoning / thinking model" },
    { value: "phi3", label: "phi3", sublabel: "small, fast" },
  ],

  // Ollama Cloud (ollama.com's hosted models) -- not a local server, needs
  // OLLAMA_API_KEY set in backend/.env. Model names carry the "-cloud" tag
  // Ollama uses to mark hosted-only variants; best-effort, verify against
  // ollama.com/search?c=cloud before relying on them.
  ollama_cloud: [
    { value: "gpt-oss:120b-cloud", label: "gpt-oss:120b-cloud", sublabel: "flagship-tier, tool-calling" },
    { value: "gpt-oss:20b-cloud", label: "gpt-oss:20b-cloud", sublabel: "cheaper / faster" },
    { value: "qwen3-coder:480b-cloud", label: "qwen3-coder:480b-cloud", sublabel: "large, coding-tuned" },
    { value: "deepseek-v3.1:671b-cloud", label: "deepseek-v3.1:671b-cloud", sublabel: "large general purpose" },
    { value: "kimi-k2:1t-cloud", label: "kimi-k2:1t-cloud", sublabel: "very large" },
  ],
};

export function defaultSeats(humanIndex: number): AgentConfig[] {
  return DEFAULT_NAMES.map((name, i) => ({
    seat_id: `seat_${i}`,
    display_name: name,
    personality: DEFAULT_PERSONALITIES[i],
    controller: i === humanIndex ? "human" : "ai",
    provider: i === humanIndex ? null : "mock",
    model_name: i === humanIndex ? null : "mock-v1",
    endpoint: null,
  }));
}
