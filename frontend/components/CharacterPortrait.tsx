import Image from "next/image";
import type { CSSProperties } from "react";
import type { Role } from "@/lib/types";
import { portraitAnimationDelay, portraitForSeat, roleArtifactFor } from "@/lib/portraits";

type PortraitVariant = "card" | "feed" | "setup";

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
      {role && variant === "card" && (
        <span className={`portrait-role portrait-role-${role}`}>
          <Image
            className="portrait-role-artifact"
            src={roleArtifactFor(role)}
            alt=""
            fill
            sizes="30px"
          />
        </span>
      )}
      {active && <span className="portrait-pulse" />}
    </div>
  );
}
