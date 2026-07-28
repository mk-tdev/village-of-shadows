import type { Player, Role } from "@/lib/types";
import { DoctorIcon, EyeIcon, SkullIcon, VillagerIcon, WolfIcon } from "./icons";

type IconComponent = (props: { className?: string }) => ReturnType<typeof WolfIcon>;

const ROLE_ICON: Record<Role, IconComponent> = {
  werewolf: WolfIcon,
  seer: EyeIcon,
  doctor: DoctorIcon,
  villager: VillagerIcon,
};

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
  const RoleIcon = roleKnown && player.role ? ROLE_ICON[player.role] : null;

  return (
    <div className={`player-card ${active ? "active" : ""} ${!player.alive ? "dead" : ""}`}>
      <div className={`avatar ${RoleIcon ? `avatar-${player.role}` : ""}`}>
        {RoleIcon ? <RoleIcon className="avatar-icon" /> : player.name[0]}
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
