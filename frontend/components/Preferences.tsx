"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "en" | "zh";

const PreferencesContext = createContext<{
  language: Language;
  wide: boolean;
  setWide: (value: boolean) => void;
}>({ language: "en", wide: false, setWide: () => {} });

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [wide, setWideState] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        localStorage.removeItem("village-language");
        setWideState(localStorage.getItem("village-layout") === "wide");
      } catch {
        // Browser storage is optional.
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dataset.layout = wide ? "wide" : "compact";
  }, [wide]);

  function setWide(value: boolean) {
    setWideState(value);
    try {
      localStorage.setItem("village-layout", value ? "wide" : "compact");
    } catch {
      // Keep the in-memory layout when browser storage is unavailable.
    }
  }

  return (
    <PreferencesContext.Provider value={{ language: "en", wide, setWide }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  return { ...context, t: (text: string) => text };
}

export function DisplayPreferences() {
  const { wide, setWide, t } = usePreferences();

  return (
    <div className="display-preferences">
      <div role="group" aria-label={t("Layout")}>
        <button type="button" aria-pressed={!wide} onClick={() => setWide(false)}>{t("Compact")}</button>
        <button type="button" aria-pressed={wide} onClick={() => setWide(true)}>{t("Wide")}</button>
      </div>
    </div>
  );
}
