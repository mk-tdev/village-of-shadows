"use client";
import { usePreferences } from "./Preferences";
export function GodViewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const {t}=usePreferences();
  return (
    <button type="button" className="toggle-wrap" aria-pressed={on} onClick={onToggle} style={{ border: 0, background: "transparent", color: "inherit", font: "inherit", padding: 0 }}>
      <span>{t("God view")}</span>
      <span aria-hidden="true" className={`toggle ${on ? "on" : ""}`} />
    </button>
  );
}
