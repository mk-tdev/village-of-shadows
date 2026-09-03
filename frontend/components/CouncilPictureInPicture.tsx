"use client";

import Image from "next/image";
import { portraitForSeat } from "@/lib/portraits";
import type { Player } from "@/lib/types";

export function CouncilPictureInPicture({
  players,
  activeSeatId,
  phase,
  caption,
  onReturn,
}: {
  players: Player[];
  activeSeatId: string | null;
  phase: string;
  caption: string;
  onReturn: () => void;
}) {
  return (
    <aside className="council-pip" aria-label="Live council picture in picture">
      <button className="council-pip-return" type="button" onClick={onReturn}>↗ Return to council</button>
      <div className={`council-pip-scene is-${phase}`}>
        <Image src="/scenes/jungle-council.webp" alt="" fill sizes="300px" priority />
        <div className="council-pip-shade" />
        <div className="council-pip-cast" aria-hidden="true">
          {players.map((player) => {
            const portrait = portraitForSeat(player.seat_id);
            return <span className={`${player.seat_id === activeSeatId ? "is-active" : ""}${player.alive ? "" : " is-fallen"}`} key={player.seat_id}>
              {portrait ? <Image src={portrait} alt="" fill sizes="44px" /> : player.name.slice(0, 1)}
            </span>;
          })}
        </div>
        <div className="council-pip-live"><b>LIVE · {phase.toUpperCase()}</b><small>{caption}</small></div>
      </div>
    </aside>
  );
}
