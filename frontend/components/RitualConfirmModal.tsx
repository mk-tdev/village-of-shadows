"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function RitualConfirmModal({
  open,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onCancel, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="ritual-modal-backdrop" role="presentation">
      <section className="ritual-modal" role="alertdialog" aria-modal="true" aria-labelledby="ritual-modal-title" aria-describedby="ritual-modal-copy">
        <div className="ritual-modal-sigil" aria-hidden="true"><span>☾</span></div>
        <span className="ritual-modal-eyebrow">BREAK THE CURRENT TIMELINE</span>
        <h2 id="ritual-modal-title">Leave this village behind?</h2>
        <p id="ritual-modal-copy">The current game will stop and you will return to the village gates. Its existing logs remain in storage, but this live council cannot be resumed.</p>
        <div className="ritual-modal-warning"><i aria-hidden="true" /> All active agent turns and human interrupts will be closed.</div>
        {error ? <p className="ritual-modal-error" role="alert">{error}</p> : null}
        <div className="ritual-modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Stay in this game</button>
          <button type="button" className="btn ritual-modal-confirm" disabled={busy} onClick={onConfirm}>{busy ? "Closing the timeline…" : "Stop game & start anew"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
