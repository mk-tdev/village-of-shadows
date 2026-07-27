import type { Player } from "@/lib/types";
import { SkullIcon } from "./icons";

export function PlayerCard({
  player,
  active,
  godView,
}: {
  player: Player;
  active: boolean;
  godView: boolean;
}) {
  const roleKnown = player.controller === "human" || !player.alive || godView;

  return (
    <div className={`player-card ${active ? "active" : ""} ${!player.alive ? "dead" : ""}`}>
      <div className="avatar">
        {player.name[0]}
        {active && <div className="pulse-ring" />}
      </div>
      <div className="p-info">
        <div className="p-name">
          {player.name}
          {player.controller === "human" && <span className="you-tag">YOU</span>}
        </div>
        <div className="p-meta">
          {!player.alive ? (
            <SkullIcon className="skull" />
          ) : (
            <span>{player.controller === "human" ? "you" : player.personality}</span>
          )}
          {roleKnown && player.role && (
            <span className={`role-chip role-${player.role}`}>{player.role}</span>
          )}
        </div>
      </div>
    </div>
  );
}
