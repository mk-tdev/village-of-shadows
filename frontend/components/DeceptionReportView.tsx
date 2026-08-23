"use client";

import { useEffect, useState } from "react";
import { fetchDeceptionReport } from "@/lib/api";
import type { DeceptionReport, GameAccessCredentials } from "@/lib/types";

export function DeceptionReportView({ sessionId, access }: { sessionId: string; access?: GameAccessCredentials }) {
  const [report, setReport] = useState<DeceptionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeceptionReport(sessionId, true, access)
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not build report");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, access]);

  if (error) return <p className="error-text">{error}</p>;
  if (!report) return <p className="metrics-empty">Reconstructing claims, pivots, clues, and belief shifts…</p>;

  return (
    <div className="summary-view deception-report-view">
      <header className="summary-section-heading is-hero">
        <div><span>FORENSIC SOCIAL TRACE</span><h3>Where the story turned</h3></div>
        <p>{report.method}</p>
      </header>

      {report.turning_point ? (
        <section className="deception-turning-point">
          <span>TURNING-POINT CANDIDATE · EVENT #{report.turning_point.seq}</span>
          <h4>{report.turning_point.fact}</h4>
          <p>{report.turning_point.interpretation}</p>
        </section>
      ) : null}

      <div className="summary-disclosure-list">
        <ForensicSection title="Public claims" count={report.claims.length}>
          {report.claims.map((claim) => (
            <article className={`forensic-card is-${claim.classification}`} key={claim.seq}>
              <span>#{claim.seq} · Round {claim.round} · {claim.speaker}</span>
              <blockquote>{claim.text}</blockquote>
              <FactInterpretation fact={claim.fact} interpretation={claim.interpretation} />
            </article>
          ))}
        </ForensicSection>
        <ForensicSection title="Vote pivots" count={report.vote_pivots.length}>
          {report.vote_pivots.map((pivot) => (
            <article className="forensic-card" key={pivot.seq}>
              <span>#{pivot.seq} · {pivot.player}</span><h4>{pivot.from} → {pivot.to}</h4>
              <FactInterpretation fact={pivot.fact} interpretation={pivot.interpretation} />
            </article>
          ))}
        </ForensicSection>
        <ForensicSection title="Major suspicion changes" count={report.belief_shifts.length}>
          {report.belief_shifts.map((shift, index) => (
            <article className="forensic-card" key={`${shift.observer}-${shift.subject}-${index}`}>
              <span>{shift.observer} about {shift.subject}</span><h4>{shift.from} → {shift.to} suspicion</h4><p>{shift.reason}</p>
            </article>
          ))}
        </ForensicSection>
        <ForensicSection title="Correct clues that went unresolved" count={report.ignored_clues.length}>
          {report.ignored_clues.map((clue) => (
            <article className="forensic-card" key={clue.seq}>
              <span>Private seer evidence · #{clue.seq}</span><h4>{clue.target}</h4>
              <FactInterpretation fact={clue.fact} interpretation={clue.interpretation} />
            </article>
          ))}
        </ForensicSection>
      </div>
    </div>
  );
}

function ForensicSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="summary-disclosure" open={count > 0}>
      <summary><span><strong>{title}</strong><small>{count} persisted findings</small></span><i>⌄</i></summary>
      <div className="summary-disclosure-content forensic-grid">
        {count ? children : <p className="summary-prose">No qualifying event was found in this game.</p>}
      </div>
    </details>
  );
}

function FactInterpretation({ fact, interpretation }: { fact: string; interpretation: string }) {
  return (
    <div className="fact-interpretation">
      <p><b>Persisted fact</b>{fact}</p>
      <p><b>Interpretation</b>{interpretation}</p>
    </div>
  );
}
