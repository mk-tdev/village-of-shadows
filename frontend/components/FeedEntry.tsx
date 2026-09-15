"use client";
import { usePreferences } from "./Preferences";
import type { LogEntry } from "@/lib/types";
import { CharacterPortrait } from "./CharacterPortrait";

function SpeakerPortrait({ entry }: { entry: LogEntry }) {
  if (!entry.seat_id || !entry.name) return null;
  return <CharacterPortrait seatId={entry.seat_id} name={entry.name} variant="feed" />;
}

export function FeedEntry({
  entry,
  godView,
  canSeeWerewolfCouncil,
}: {
  entry: LogEntry;
  godView: boolean;
  canSeeWerewolfCouncil: boolean;
}) {
  const { t } = usePreferences();
  if (entry.type === "system") {
    return <div className="entry entry-system">{entry.text ? t(entry.text) : entry.text}</div>;
  }
  if (entry.type === "village_event") {
    return <div className="entry entry-village-event"><span>{t("ROUND EVENT")}</span>{entry.text ? t(entry.text) : entry.text}</div>;
  }
  if (entry.type === "hunter") {
    return <div className="entry entry-death entry-hunter">⚔ {entry.text ? t(entry.text) : entry.text}</div>;
  }
  if (entry.type === "death") {
    return <div className="entry entry-death">{entry.text ? t(entry.text) : entry.text}</div>;
  }
  if (entry.type === "winner") {
    return <div className="entry entry-winner">{entry.text ? t(entry.text) : entry.text}</div>;
  }
  if (entry.type === "statement") {
    return (
      <div className="entry entry-statement">
        <SpeakerPortrait entry={entry} />
        <div className="entry-body">
          <div className="entry-name">{entry.name}</div>
          {entry.thought && godView && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-said">{entry.text ? t(entry.text) : entry.text}</div>
        </div>
      </div>
    );
  }
  if (entry.type === "vote") {
    if (entry.private && !godView) return null;
    return (
      <div className="entry entry-statement">
        <SpeakerPortrait entry={entry} />
        <div className="entry-body">
          <div className="entry-name">{t("Vote")}</div>
          {entry.thought && godView && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-vote">
            {entry.name} votes to eliminate <b>{entry.target}</b>
          </div>
        </div>
      </div>
    );
  }
  if (entry.type === "werewolf_negotiation") {
    if (!godView && !canSeeWerewolfCouncil) return null;
    return (
      <div className="entry entry-statement private wolf-council-entry">
        <SpeakerPortrait entry={entry} />
        <div className="entry-body">
          <div className="entry-name">
            {entry.name ?? "The pack"} <span className="private-tag">wolf council</span>
          </div>
          <div className="entry-said">{entry.text ? t(entry.text) : entry.text}</div>
          {entry.target && entry.seat_id && (
            <div className="wolf-council-target">Proposes: {entry.target}</div>
          )}
        </div>
      </div>
    );
  }
  if (entry.type === "werewolf" || entry.type === "seer" || entry.type === "doctor") {
    if (entry.private && !godView) return null;
    return (
      <div className="entry entry-statement private">
        <SpeakerPortrait entry={entry} />
        <div className="entry-body">
          <div className="entry-name">
            {entry.name} <span className="private-tag">{entry.type}</span>
          </div>
          {entry.thought && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-said">{entry.text ? t(entry.text) : entry.text}</div>
        </div>
      </div>
    );
  }
  return null;
}
