"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { characterUrl } from "./CharacterAssets";
import { usePreferences } from "./Preferences";

export function CharacterCreator({ name, characterId, onChange, onBusyChange, disabled = false }: {
  name: string;
  characterId?: string | null;
  onChange: (id: string | null) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = usePreferences();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const setWorking = (value: boolean) => { setBusy(value); onBusyChange?.(value); };
  async function generate() {
    if (!photo || busy) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/characters/generate`, {
        method: "POST", body: photo, headers: { "Content-Type": photo.type },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Character generation failed.");
      setDraft(result.character_id);
    } catch (e) { setError(e instanceof Error ? e.message : "Character generation failed."); }
    finally { setWorking(false); }
  }
  async function apply(id: string | null) {
    setWorking(true); setError("");
    try { await onChange(id); setDraft(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save character."); }
    finally { setWorking(false); }
  }
  const displayed = draft ?? characterId;
  return <details className="character-studio">
    <summary>{t("Your village character")} · {name}{characterId ? ` · ${t("Ready")}` : ` · ${t("Optional")}`}</summary>
    <p>{t("Upload a clear photo of one person. Generate a realistic village character while preserving their face.")}</p>
    <div className="character-studio-content">
      <div className="character-studio-controls">
        <label className="field-label">{t("Reference photo")} · JPEG / PNG / WebP · 8 MB
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { setError("Photo must be smaller than 8 MB."); return; }
            setPhoto(file); setPreview(URL.createObjectURL(file)); setDraft(null); setError("");
          }} />
        </label>
        <p className="character-disclosure">{t("Generate sends this photo to OpenAI. We save only the generated character, visible to everyone in your room. AI likeness may vary; preview before using.")}</p>
        <button type="button" className="btn btn-secondary" disabled={!photo || busy || disabled} onClick={generate}>{busy ? t("Working…") : t("Generate character")}</button>
        {busy && <p role="status">{t("This can take a couple of minutes. Keep this page open.")}</p>}
        {draft && <button type="button" className="btn" disabled={busy || disabled} onClick={() => apply(draft)}>{t("Use this character")}</button>}
        {characterId && <button type="button" className="btn btn-secondary" disabled={busy || disabled} onClick={() => apply(null)}>{t("Use default character")}</button>}
        {error && <p className="error" role="alert">{t(error)}</p>}
      </div>
      {preview && <div className="character-reference"><Image unoptimized src={preview} alt={t("Reference photo")} width={120} height={150} /></div>}
      {displayed && <div className="character-generated"><Image unoptimized src={characterUrl(displayed, "full")} alt={`${name} · ${t("Generated character preview")}`} width={200} height={300} /><span>{draft ? t("Preview · not yet applied") : t("Character selected")}</span></div>}
    </div>
  </details>;
}
