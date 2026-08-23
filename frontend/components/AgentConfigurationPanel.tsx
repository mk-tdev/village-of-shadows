import type { Player } from "@/lib/types";

export function AgentConfigurationPanel({ players }: { players: Player[] }) {
  return (
    <section className="agent-config-observer">
      <div className="private-notes-heading"><div><p className="debug-section-title">God Mode · effective agent configuration</p><p className="private-notes-explainer">The exact versioned experiment profile checkpointed with this game. Role and safety instructions remain outside these additions.</p></div><span className="private-notes-count">v1 configs</span></div>
      <div className="agent-config-grid">{players.filter((player) => player.controller === "ai").map((player) => {
        const profile = player.behavior;
        return <article key={player.seat_id}><header><strong>{player.name}</strong><span>{player.model_name}</span></header>{profile ? <><div><b>{profile.risk_tolerance}</b><small>risk</small><b>{profile.honesty}</b><small>honesty</small><b>{profile.aggressiveness}</b><small>aggression</small></div><p>{profile.reasoning_level} reasoning · {profile.memory_strategy} memory · {profile.tool_strategy} tools · {profile.turn_token_budget} token cap</p><blockquote>{profile.system_prompt_addition || "No additional speaking direction."}</blockquote></> : <p>Default profile</p>}</article>;
      })}</div>
    </section>
  );
}
