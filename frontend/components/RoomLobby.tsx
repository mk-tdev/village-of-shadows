"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchRoom, replaceRoomSeatWithAi, rotateRoomSeatToken } from "@/lib/api";
import type { CreatedGame, GameAccessCredentials } from "@/lib/types";

export function RoomLobby({
  sessionId,
  access,
}: {
  sessionId: string;
  access: GameAccessCredentials;
}) {
  const [created, setCreated] = useState<CreatedGame | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(window.localStorage.getItem(`village-room:${sessionId}`) ?? "null"); }
    catch { return null; }
  });
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostToken = access.hostToken ?? "";

  useEffect(() => {
    if (!hostToken) return;
    let cancelled = false;
    const poll = () => fetchRoom(sessionId, hostToken).then((room) => {
      if (!cancelled) setClaimed(Object.fromEntries(room.human_seats.map((seat) => [seat.seat_id, seat.claimed])));
    }).catch(() => {});
    void poll();
    const timer = window.setInterval(poll, 1600);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [sessionId, hostToken]);

  const links = useMemo(() => {
    if (!created || typeof window === "undefined") return [];
    return created.human_seats.map((seat) => ({
      ...seat,
      url: `${window.location.origin}/game/${sessionId}?${new URLSearchParams({ seat_id: seat.seat_id, access_token: seat.access_token })}`,
    }));
  }, [created, sessionId]);

  const rotate = async (seatId: string) => {
    if (!created || !hostToken) return;
    try {
      const next = await rotateRoomSeatToken(sessionId, seatId, hostToken);
      const updated = { ...created, human_seats: created.human_seats.map((seat) => seat.seat_id === seatId ? { ...seat, access_token: next.access_token } : seat) };
      setCreated(updated);
      window.localStorage.setItem(`village-room:${sessionId}`, JSON.stringify(updated));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not rotate link"); }
  };

  const replaceWithAi = async (seatId: string) => {
    if (!hostToken) return;
    try {
      await replaceRoomSeatWithAi(sessionId, seatId, hostToken);
      if (created) {
        const updated = { ...created, human_seats: created.human_seats.filter((seat) => seat.seat_id !== seatId) };
        setCreated(updated);
        window.localStorage.setItem(`village-room:${sessionId}`, JSON.stringify(updated));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not replace seat"); }
  };

  const hostQuery = new URLSearchParams({ seat_id: access.seatId, access_token: access.accessToken, host_token: hostToken });
  return (
    <main className="app room-lobby">
      <header><span>MULTI-HUMAN COUNCIL</span><h1>Gather the village.</h1><p>Every person enters through a different cryptographic seat. The server filters roles, prompts, and private actions before they reach each browser.</p></header>
      <section className="room-code"><span>ROOM CODE</span><strong>{created?.room_code ?? "••••••"}</strong><small>{links.length} human seats · AI fills the rest</small></section>
      <section className="room-seat-links">
        {links.map((seat) => {
          const isHostSeat = seat.seat_id === access.seatId;
          return <article key={seat.seat_id} className={claimed[seat.seat_id] ? "is-claimed" : ""}><div><span>{claimed[seat.seat_id] ? "CONNECTED" : isHostSeat ? "YOUR SEAT" : "WAITING"}</span><h2>{seat.name}</h2><small>{seat.seat_id}</small></div>{isHostSeat ? <Link className="btn" href={`/game/${sessionId}?${hostQuery}`}>Enter as host</Link> : <><button type="button" onClick={async () => { await navigator.clipboard.writeText(seat.url); setCopied(seat.seat_id); }}>{copied === seat.seat_id ? "Copied" : "Copy private join link"}</button><button className="room-rotate" type="button" onClick={() => rotate(seat.seat_id)}>Rotate link</button><button className="room-rotate" type="button" onClick={() => replaceWithAi(seat.seat_id)}>Replace with safe AI</button></>}</article>;
        })}
      </section>
      {error ? <p className="error-text">{error}</p> : null}
      <p className="room-lobby-note">The game begins only when the host enters and presses Start Game. Reopening a valid join link restores that player&apos;s pending turn.</p>
    </main>
  );
}
