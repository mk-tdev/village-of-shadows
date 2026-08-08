import type { Player, Role } from "@/lib/types";
import { SkullIcon } from "./icons";
import { CharacterPortrait } from "./CharacterPortrait";

export function PlayerCard({
  player,
  active,
  godView,
  knownRole,
}: {
  player: Player;
  active: boolean;
  godView: boolean;
  knownRole?: Role;
}) {
  const visibleRole =
    player.controller === "human" || !player.alive || godView
      ? player.role
      : knownRole;

  return (
    <div className={`player-card ${active ? "active" : ""} ${!player.alive ? "dead" : ""}`}>
      <CharacterPortrait
        seatId={player.seat_id}
        name={player.name}
        role={visibleRole}
        active={active}
        dead={!player.alive}
      />
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
          {visibleRole && (
            <span className={`role-chip role-${visibleRole}`}>{visibleRole}</span>
          )}
        </div>
      </div>
    </div>
  );
}
