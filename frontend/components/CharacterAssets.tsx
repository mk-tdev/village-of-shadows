"use client";

import { createContext, useContext, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { portraitForSeat, fullCharacterForSeat } from "@/lib/portraits";

const CharacterAssets = createContext<Record<string, string | null | undefined>>({});
export function characterUrl(id: string, variant: "full" | "portrait") {
  return `${API_BASE}/characters/${id}/${variant}`;
}
export function CharacterAssetsProvider({ players, children }: {
  players: { seat_id: string; character_id?: string | null }[]; children: ReactNode;
}) {
  return <CharacterAssets.Provider value={Object.fromEntries(players.map(p => [p.seat_id, p.character_id]))}>{children}</CharacterAssets.Provider>;
}
export function useCharacterAssets() {
  const ids = useContext(CharacterAssets);
  return {
    portrait: (seatId: string) => ids[seatId] ? characterUrl(ids[seatId], "portrait") : portraitForSeat(seatId),
    full: (seatId: string) => ids[seatId] ? characterUrl(ids[seatId], "full") : fullCharacterForSeat(seatId),
    custom: (seatId: string) => Boolean(ids[seatId]),
  };
}
