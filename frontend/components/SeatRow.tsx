import type { AgentConfig, Provider } from "@/lib/types";
import { PROVIDER_MODEL_SUGGESTIONS } from "@/lib/seatDefaults";
import { Select } from "./Select";
import { Combobox } from "./Combobox";

const PROVIDER_OPTIONS = [
  { value: "mock", label: "mock", sublabel: "offline" },
  { value: "claude", label: "Claude" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama" },
];

export function SeatRow({
  seat,
  isHuman,
  onChange,
}: {
  seat: AgentConfig;
  isHuman: boolean;
  onChange: (next: AgentConfig) => void;
}) {
  return (
    <div className="seat-row">
      <div>
        <label className="field-label">Name</label>
        <input
          type="text"
          value={seat.display_name}
          onChange={(e) => onChange({ ...seat, display_name: e.target.value })}
        />
      </div>
      <div>
        <label className="field-label">Personality</label>
        <input
          type="text"
          value={seat.personality}
          onChange={(e) => onChange({ ...seat, personality: e.target.value })}
        />
      </div>
      <div>
        <label className="field-label">Controller</label>
        <div style={{ fontSize: 13.5, color: isHuman ? "var(--amber)" : "var(--ink-dim)" }}>
          {isHuman ? "You" : "AI"}
        </div>
      </div>
      {isHuman ? (
        <>
          <div />
          <div />
        </>
      ) : (
        <>
          <div>
            <label className="field-label">Provider</label>
            <Select
              value={seat.provider ?? "mock"}
              options={PROVIDER_OPTIONS}
              onChange={(value) => {
                const provider = value as Provider;
                onChange({
                  ...seat,
                  provider,
                  model_name: PROVIDER_MODEL_SUGGESTIONS[provider][0].value,
                  endpoint: provider === "ollama" ? "http://localhost:11434" : null,
                });
              }}
            />
          </div>
          <div>
            <label className="field-label">Model</label>
            <Combobox
              value={seat.model_name ?? ""}
              options={PROVIDER_MODEL_SUGGESTIONS[seat.provider ?? "mock"]}
              onChange={(value) => onChange({ ...seat, model_name: value })}
              placeholder="Model name"
            />
            {seat.provider === "ollama" && (
              <input
                type="text"
                style={{ marginTop: 6 }}
                placeholder="http://localhost:11434"
                value={seat.endpoint ?? ""}
                onChange={(e) => onChange({ ...seat, endpoint: e.target.value })}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
