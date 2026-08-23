"use client";

import { useEffect, useMemo, useState } from "react";
import { createReplayShare, listReplayShares, revokeReplayShare } from "@/lib/api";
import type { GameAccessCredentials, ReplayShareRecord } from "@/lib/types";
import { Select } from "@/components/Select";

export function ShareReplayPanel({
  sessionId,
  access,
}: {
  sessionId: string;
  access?: GameAccessCredentials;
}) {
  const [scope, setScope] = useState<"public" | "god">("public");
  const [expiry, setExpiry] = useState("168");
  const [shares, setShares] = useState<ReplayShareRecord[]>([]);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canShare = Boolean(access?.hostToken);
  const activeShares = useMemo(() => shares.filter((item) => !item.revoked_at), [shares]);

  useEffect(() => {
    if (!canShare) return;
    let cancelled = false;
    listReplayShares(sessionId, access)
      .then((items) => { if (!cancelled) setShares(items); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load links"); });
    return () => { cancelled = true; };
  }, [sessionId, access, canShare]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await createReplayShare(
        sessionId,
        { scope, expires_in_hours: expiry ? Number(expiry) : null },
        access,
      );
      const url = new URL(`/replay/${result.share_id}`, window.location.origin);
      if (result.secret) url.searchParams.set("secret", result.secret);
      setCreatedUrl(url.toString());
      setShares(await listReplayShares(sessionId, access));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create replay");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeReplayShare(sessionId, shareId, access);
      setShares(await listReplayShares(sessionId, access));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not revoke replay");
    } finally {
      setBusy(false);
    }
  }

  if (!canShare) {
    return <p className="metrics-empty">Only the room host can publish an immutable replay.</p>;
  }

  return (
    <div className="summary-view replay-share-panel">
      <header className="summary-section-heading is-hero">
        <div>
          <span>SHAREABLE REPLAY</span>
          <h3>Publish the evidence, not your credentials</h3>
        </div>
        <p>The snapshot is immutable. Provider keys, endpoints, checkpoint IDs and raw prompts are never exported.</p>
      </header>

      <section className="replay-share-builder">
        <label>
          Perspective
          <Select value={scope} onChange={(value) => setScope(value as "public" | "god")} ariaLabel="Replay perspective" options={[
            { value: "public", label: "Public game", sublabel: "Public events only" },
            { value: "god", label: "God Mode", sublabel: "Private evidence · secret URL" },
          ]} />
        </label>
        <label>
          Expires after
          <Select value={expiry} onChange={setExpiry} ariaLabel="Replay expiry" options={[
            { value: "24", label: "24 hours" },
            { value: "168", label: "7 days" },
            { value: "720", label: "30 days" },
            { value: "", label: "Never" },
          ]} />
        </label>
        <button type="button" className="summary-action" disabled={busy} onClick={create}>
          {busy ? "Sealing snapshot…" : "Create replay link"}
        </button>
      </section>

      {createdUrl ? (
        <section className="replay-created" aria-live="polite">
          <span>New immutable link</span>
          <code>{createdUrl}</code>
          <button type="button" onClick={() => navigator.clipboard.writeText(createdUrl)}>Copy link</button>
          {scope === "god" ? <small>The secret exists only in this URL. Save it now.</small> : null}
        </section>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <section>
        <div className="summary-section-heading">
          <div><span>ACTIVE LINKS</span><h3>{activeShares.length} replay{activeShares.length === 1 ? "" : "s"}</h3></div>
        </div>
        {activeShares.length ? (
          <div className="replay-link-list">
            {activeShares.map((item) => (
              <article key={item.id}>
                <div><strong>{item.scope === "god" ? "God Mode" : "Public"}</strong><span>{item.id}</span></div>
                <small>{item.expires_at ? `Expires ${new Date(item.expires_at).toLocaleString()}` : "Does not expire"}</small>
                <button type="button" disabled={busy} onClick={() => revoke(item.id)}>Revoke</button>
              </article>
            ))}
          </div>
        ) : <p className="metrics-empty">No active replay links.</p>}
      </section>
    </div>
  );
}
