"use client";

import { useEffect, useRef } from "react";
import type { LogEntry, TurnEvent } from "@/lib/types";
import { FeedEntry } from "./FeedEntry";
import { CharacterPortrait } from "./CharacterPortrait";

export function Feed({
  speakingSeq = null,
  entries,
  godView,
  canSeeWerewolfCouncil,
  active,
}: {
  speakingSeq?: number | null;
  entries: LogEntry[];
  godView: boolean;
  canSeeWerewolfCouncil: boolean;
  active: TurnEvent | null;
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      const speaking = speakingSeq === null ? null : el.querySelector<HTMLElement>(`[data-seq="${speakingSeq}"]`);
      if(speaking) el.scrollTop = speaking.offsetTop - el.offsetTop;
      else el.scrollTop = el.scrollHeight;
    }
  }, [entries.length, active, speakingSeq]);

  return (
    <div className="feed" ref={feedRef}>
      {entries.map((entry) => (
        <div key={entry.seq} data-seq={entry.seq} className={`feed-line${entry.seq === speakingSeq ? " is-speaking" : ""}`}><FeedEntry
          entry={entry}
          godView={godView}
          canSeeWerewolfCouncil={canSeeWerewolfCouncil}
        /></div>
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
