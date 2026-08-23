"use client";

import { useState } from "react";
import { DEFAULT_BEHAVIOR, DEFAULT_RESILIENCE } from "@/lib/seatDefaults";
import type { AgentBehavior, AgentConfig } from "@/lib/types";
import { Select } from "@/components/Select";
import { ThemedCheckbox } from "@/components/ThemedCheckbox";

type SavedPreset = { id: string; name: string; behavior: AgentBehavior };

export function AgentLabPanel({
  seats,
  onChange,
}: {
  seats: AgentConfig[];
  onChange: (index: number, seat: AgentConfig) => void;
}) {
  const aiIndices = seats.map((seat, index) => seat.controller === "ai" ? index : -1).filter((index) => index >= 0);
  const [seatIndex, setSeatIndex] = useState(aiIndices[0] ?? 0);
  const [presetName, setPresetName] = useState("My agent profile");
  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("village-agent-presets") ?? "[]"); }
    catch { return []; }
  });
  const seat = seats[seatIndex] ?? seats[0];
  const behavior = seat?.behavior ?? DEFAULT_BEHAVIOR;
  const resilience = seat?.resilience ?? DEFAULT_RESILIENCE;

  const update = (patch: Partial<AgentBehavior>) => {
    if (!seat) return;
    onChange(seatIndex, { ...seat, behavior: { ...behavior, ...patch, version: 1 } });
  };
  const updateResilience = (patch: Partial<typeof resilience>) => {
    if (!seat) return;
    onChange(seatIndex, { ...seat, resilience: { ...resilience, ...patch } });
  };
  const persist = (next: SavedPreset[]) => {
    setPresets(next);
    try { window.localStorage.setItem("village-agent-presets", JSON.stringify(next)); } catch {}
  };
  const save = () => {
    const next = [...presets, { id: crypto.randomUUID(), name: presetName.trim() || "Untitled profile", behavior: { ...behavior } }];
    persist(next);
  };
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ name: presetName, behavior }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${(presetName || "agent-profile").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <details className="agent-lab-panel">
      <summary><span><b>Custom agent laboratory</b><small>Versioned personality, reasoning, memory and tool strategy</small></span><i>⌄</i></summary>
      <div className="agent-lab-content">
        <div className="agent-lab-notice"><b>BASE RULES STAY LOCKED</b>These controls are additions to the role, privacy, identity, and safety prompts. They cannot remove them.</div>
        <label className="agent-lab-seat">Configure seat<Select value={String(seatIndex)} onChange={(value) => setSeatIndex(Number(value))} ariaLabel="Agent laboratory seat" options={aiIndices.map((index) => ({ value: String(index), label: seats[index].display_name }))} /></label>
        <div className="agent-lab-sliders">
          <Range label="Risk tolerance" value={behavior.risk_tolerance} onChange={(value) => update({ risk_tolerance: value })} />
          <Range label="Honesty tendency" value={behavior.honesty} onChange={(value) => update({ honesty: value })} />
          <Range label="Aggressiveness" value={behavior.aggressiveness} onChange={(value) => update({ aggressiveness: value })} />
        </div>
        <div className="agent-lab-selects">
          <Choice label="Reasoning" value={behavior.reasoning_level} options={["low", "medium", "high"]} onChange={(value) => update({ reasoning_level: value as AgentBehavior["reasoning_level"] })} />
          <Choice label="Memory" value={behavior.memory_strategy} options={["recency", "selective", "exhaustive"]} onChange={(value) => update({ memory_strategy: value as AgentBehavior["memory_strategy"] })} />
          <Choice label="Tool use" value={behavior.tool_strategy} options={["cautious", "balanced", "decisive"]} onChange={(value) => update({ tool_strategy: value as AgentBehavior["tool_strategy"] })} />
          <label>Turn token budget<input type="number" min={128} max={4096} value={behavior.turn_token_budget} onChange={(event) => update({ turn_token_budget: Number(event.target.value) })} /></label>
        </div>
        <label className="agent-lab-prompt">Additional speaking direction<textarea maxLength={600} value={behavior.system_prompt_addition} onChange={(event) => update({ system_prompt_addition: event.target.value })} placeholder="Example: Ask one precise question before making an accusation." /><small>{behavior.system_prompt_addition.length}/600 · base role prompt remains intact</small></label>
        <details className="resilience-config"><summary>Failure &amp; resilience policy</summary><div><label>Timeout seconds<input type="number" min={3} max={180} value={resilience.timeout_seconds} onChange={(event) => updateResilience({ timeout_seconds: Number(event.target.value) })} /></label><label>Retries<input type="number" min={0} max={4} value={resilience.max_retries} onChange={(event) => updateResilience({ max_retries: Number(event.target.value) })} /></label><label>Fallback provider<Select value={resilience.fallback_provider ?? ""} onChange={(value) => updateResilience({ fallback_provider: (value || null) as typeof resilience.fallback_provider })} ariaLabel="Fallback provider" options={[{ value: "", label: "Validated rules only" }, { value: "openai", label: "OpenAI" }, { value: "claude", label: "Claude" }, { value: "gemini", label: "Gemini" }, { value: "ollama_cloud", label: "Ollama Cloud" }]} /></label><label>Fallback model<input value={resilience.fallback_model ?? ""} onChange={(event) => updateResilience({ fallback_model: event.target.value || null })} placeholder="Optional exact model ID" /></label><ThemedCheckbox className="resilience-check" checked={resilience.pause_after_exhaustion} onChange={(checked) => updateResilience({ pause_after_exhaustion: checked })}>Pause after safe fallback</ThemedCheckbox></div></details>
        <div className="agent-preset-actions"><input value={presetName} maxLength={50} onChange={(event) => setPresetName(event.target.value)} /><button type="button" onClick={save}>Save preset</button><button type="button" onClick={exportPreset}>Export JSON</button></div>
        {presets.length ? <div className="agent-preset-list">{presets.map((preset) => <article key={preset.id}><span><b>{preset.name}</b><small>risk {preset.behavior.risk_tolerance} · honesty {preset.behavior.honesty} · {preset.behavior.reasoning_level}</small></span><button type="button" onClick={() => update(preset.behavior)}>Apply</button><button type="button" onClick={() => persist([...presets, { ...preset, id: crypto.randomUUID(), name: `${preset.name} copy`, behavior: { ...preset.behavior } }])}>Duplicate</button><button type="button" onClick={() => persist(presets.filter((item) => item.id !== preset.id))}>Delete</button></article>)}</div> : null}
      </div>
    </details>
  );
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}<b>{value}</b></span><input type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label>{label}<Select value={value} onChange={onChange} ariaLabel={label} options={options.map((option) => ({ value: option, label: option.charAt(0).toUpperCase() + option.slice(1) }))} /></label>;
}
