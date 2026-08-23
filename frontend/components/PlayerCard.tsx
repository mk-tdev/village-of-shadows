import type { Player, Role } from "@/lib/types";
import { SkullIcon } from "./icons";
import { CharacterPortrait } from "./CharacterPortrait";

export function PlayerCard({
  player,
  active,
  godView,
  knownRole,
  viewerSeatId,
}: {
  player: Player;
  active: boolean;
  godView: boolean;
  knownRole?: Role;
  viewerSeatId?: string | null;
}) {
  const isYou = player.seat_id === viewerSeatId;
  const visibleRole =
    isYou || !player.alive || godView
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
          {isYou && <span className="you-tag">YOU</span>}
          {!isYou && player.controller === "human" && <span className="human-tag">HUMAN</span>}
        </div>
        <div className="p-meta">
          {!player.alive ? (
            <SkullIcon className="skull" />
          ) : (
            <span>{isYou ? "you" : player.controller === "human" ? "human player" : player.personality}</span>
          )}
          {visibleRole && (
            <span className={`role-chip role-${visibleRole}`}>{visibleRole}</span>
          )}
        </div>
      </div>
    </div>
  );
}
