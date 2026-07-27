export function GodViewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="toggle-wrap" onClick={onToggle}>
      <span>God view</span>
      <div className={`toggle ${on ? "on" : ""}`} />
    </div>
  );
}
