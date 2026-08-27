import type { AgentConfig, Provider } from "@/lib/types";
import { DEMO_PROVIDER_OPTIONS, PROVIDER_MODEL_SUGGESTIONS } from "@/lib/seatDefaults";
import { Select } from "./Select";
import { Combobox } from "./Combobox";
import { CharacterPortrait } from "./CharacterPortrait";

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
    <div className={`seat-row-wrap ${isHuman ? "you" : ""}`}>
      {/* Portrait identity is tied to the stable seat id, while names and
          personalities remain freely editable. Roles are still hidden until
          the graph's assign_roles node runs. */}
      <CharacterPortrait
        seatId={seat.seat_id}
        name={seat.display_name}
        variant="setup"
        active={isHuman}
      />

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
          <span className={`controller-badge ${isHuman ? "you" : "ai"}`}>{isHuman ? "YOU" : "AI"}</span>
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
                options={DEMO_PROVIDER_OPTIONS}
                onChange={(value) => {
                  const provider = value as Provider;
                  onChange({
                    ...seat,
                    provider,
                    model_name: PROVIDER_MODEL_SUGGESTIONS[provider][0].value,
                    // Ollama Cloud's endpoint defaults server-side to
                    // settings.ollama_cloud_url (see adapters.py) -- left
                    // null here rather than hardcoding "https://ollama.com"
                    // so the backend's one place of truth doesn't drift out
                    // of sync with this dropdown.
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
                placeholder="Model name or custom ID"
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
              {seat.provider === "ollama_cloud" && (
                <input
                  type="text"
                  style={{ marginTop: 6 }}
                  placeholder="https://ollama.com (default, leave blank)"
                  value={seat.endpoint ?? ""}
                  onChange={(e) => onChange({ ...seat, endpoint: e.target.value || null })}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
