"use client";

import { useEffect, useRef } from "react";
import type { LogEntry, TurnEvent } from "@/lib/types";
import { FeedEntry } from "./FeedEntry";
import { CharacterPortrait } from "./CharacterPortrait";

export function Feed({
  entries,
  godView,
  canSeeWerewolfCouncil,
  active,
}: {
  entries: LogEntry[];
  godView: boolean;
  canSeeWerewolfCouncil: boolean;
  active: TurnEvent | null;
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, active]);

  return (
    <div className="feed" ref={feedRef}>
      {entries.map((entry) => (
        <FeedEntry
          key={entry.seq}
          entry={entry}
          godView={godView}
          canSeeWerewolfCouncil={canSeeWerewolfCouncil}
        />
      ))}
      {active && (
        <div className="entry entry-thinking">
          {active.seat_id && active.name && (
            <CharacterPortrait
              seatId={active.seat_id}
              name={active.name}
              variant="feed"
              active
            />
          )}
          <span>
            {active.name} is thinking
            <span className="dot-flicker" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
