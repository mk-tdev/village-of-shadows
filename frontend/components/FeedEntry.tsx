import type { LogEntry } from "@/lib/types";

export function FeedEntry({ entry, godView }: { entry: LogEntry; godView: boolean }) {
  if (entry.type === "system") {
    return <div className="entry entry-system">{entry.text}</div>;
  }
  if (entry.type === "death") {
    return <div className="entry entry-death">{entry.text}</div>;
  }
  if (entry.type === "winner") {
    return <div className="entry entry-winner">{entry.text}</div>;
  }
  if (entry.type === "statement") {
    return (
      <div className="entry entry-statement">
        <div className="entry-avatar">{entry.name?.[0]}</div>
        <div className="entry-body">
          <div className="entry-name">{entry.name}</div>
          {entry.thought && godView && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-said">{entry.text}</div>
        </div>
      </div>
    );
  }
  if (entry.type === "vote") {
    return (
      <div className="entry entry-statement">
        <div className="entry-avatar">{entry.name?.[0]}</div>
        <div className="entry-body">
          <div className="entry-name">Vote</div>
          {entry.thought && godView && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-vote">
            {entry.name} votes to eliminate <b>{entry.target}</b>
          </div>
        </div>
      </div>
    );
  }
  if (entry.type === "werewolf" || entry.type === "seer" || entry.type === "doctor") {
    if (entry.private && !godView) return null;
    return (
      <div className="entry entry-statement private">
        <div className="entry-avatar">{entry.name?.[0]}</div>
        <div className="entry-body">
          <div className="entry-name">
            {entry.name} <span className="private-tag">{entry.type}</span>
          </div>
          {entry.thought && <div className="entry-thought">{entry.thought}</div>}
          <div className="entry-said">{entry.text}</div>
        </div>
      </div>
    );
  }
  return null;
}
