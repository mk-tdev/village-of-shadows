"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteRelationship, editRelationship, fetchRelationships } from "@/lib/api";
import type { RelationshipMemory } from "@/lib/types";

export function RelationshipArchive() {
  const [memories, setMemories] = useState<RelationshipMemory[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => fetchRelationships().then(setMemories).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load memories"));
  useEffect(() => { void load(); }, []);

  const owners = [...new Set(memories.map((memory) => memory.owner_name))];
  return (
    <main className="app relationship-page">
      <header><Link href="/setup">← Game setup</Link><span>CROSS-GAME CONTINUITY · OPT IN</span><h1>What the personas remember.</h1><p>These memories describe communication patterns from earlier games. They never carry a former secret role into a new deal.</p></header>
      <section className="relationship-safety"><b>ROLE AMNESIA IS ENFORCED</b><span>Every memory cites its source game and event. Disable “Cross-game relationships” in setup to give every persona a completely clean slate.</span></section>
      {error ? <p className="error-text">{error}</p> : null}
      {owners.length === 0 ? <p className="metrics-empty">No opted-in game has produced a relationship memory yet.</p> : owners.map((owner) => <section className="relationship-owner" key={owner}><h2>{owner}&apos;s archive</h2><div>{memories.filter((memory) => memory.owner_name === owner).map((memory) => <article key={memory.id}><header><span>ABOUT {memory.subject_name}</span><small>game {memory.source_game_id.slice(0, 8)} · {memory.source_seq === null ? "opening" : `event #${memory.source_seq}`}</small></header>{editing === memory.id ? <textarea value={draft} maxLength={800} onChange={(event) => setDraft(event.target.value)} /> : <p>{memory.memory}</p>}<footer>{editing === memory.id ? <><button type="button" onClick={async () => { await editRelationship(memory.id, draft); setEditing(null); void load(); }}>Save edit</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></> : <button type="button" onClick={() => { setEditing(memory.id); setDraft(memory.memory); }}>Edit</button>}<button className="is-danger" type="button" onClick={async () => { if (!window.confirm("Erase this cross-game memory?")) return; await deleteRelationship(memory.id); void load(); }}>Erase</button></footer></article>)}</div></section>)}
    </main>
  );
}
