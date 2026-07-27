"use client";

import { useEffect, useRef } from "react";
import type { LogEntry, TurnEvent } from "@/lib/types";
import { FeedEntry } from "./FeedEntry";

export function Feed({
  entries,
  godView,
  active,
}: {
  entries: LogEntry[];
  godView: boolean;
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
        <FeedEntry key={entry.seq} entry={entry} godView={godView} />
      ))}
      {active && (
        <div className="entry entry-thinking">
          <span>{active.name} is thinking</span>
          <span className="dot-flicker">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
    </div>
  );
}
