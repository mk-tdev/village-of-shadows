import Image from "next/image";
import type { CSSProperties } from "react";
import type { Role } from "@/lib/types";
import { portraitAnimationDelay, portraitForSeat } from "@/lib/portraits";
import { DoctorIcon, EyeIcon, VillagerIcon, WolfIcon } from "./icons";

type PortraitVariant = "card" | "feed" | "setup";
type IconComponent = (props: { className?: string }) => ReturnType<typeof WolfIcon>;

const ROLE_ICON: Record<Role, IconComponent> = {
  werewolf: WolfIcon,
  seer: EyeIcon,
  doctor: DoctorIcon,
  villager: VillagerIcon,
};

export function CharacterPortrait({
  seatId,
  name,
  role,
  active = false,
  dead = false,
  variant = "card",
}: {
  seatId: string;
  name: string;
  role?: Role | null;
  active?: boolean;
  dead?: boolean;
  variant?: PortraitVariant;
}) {
  const portrait = portraitForSeat(seatId);
  const RoleIcon = role ? ROLE_ICON[role] : null;
  const style = {
    "--portrait-delay": portraitAnimationDelay(seatId),
  } as CSSProperties;

  return (
    <div
      className={`character-portrait portrait-${variant}${active ? " is-active" : ""}${dead ? " is-dead" : ""}`}
      style={style}
      aria-hidden="true"
    >
      <div className="portrait-frame">
        {portrait ? (
          <Image
            className="portrait-image"
            src={portrait}
            alt=""
            fill
            sizes={variant === "feed" ? "32px" : variant === "setup" ? "64px" : "58px"}
          />
        ) : (
          <span className="portrait-fallback">{name.trim()[0]?.toUpperCase() ?? "?"}</span>
        )}
        <span className="portrait-shadow" />
        <span className="portrait-light" />
      </div>
      {RoleIcon && variant === "card" && (
        <span className={`portrait-role portrait-role-${role}`}>
          <RoleIcon className="portrait-role-icon" />
        </span>
      )}
      {active && <span className="portrait-pulse" />}
    </div>
  );
}
