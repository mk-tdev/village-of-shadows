"use client";
import { usePreferences } from "./Preferences";
export function GodViewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const {t}=usePreferences();
  return (
    <div className="toggle-wrap" onClick={onToggle}>
      <span>{t("God view")}</span>
      <div className={`toggle ${on ? "on" : ""}`} />
    </div>
  );
}
