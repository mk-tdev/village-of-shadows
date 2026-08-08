const PORTRAIT_BY_SEAT: Record<string, string> = {
  seat_0: "/portraits/mara.webp",
  seat_1: "/portraits/tomas.webp",
  seat_2: "/portraits/elin.webp",
  seat_3: "/portraits/bram.webp",
  seat_4: "/portraits/sable.webp",
  seat_5: "/portraits/corvin.webp",
  seat_6: "/portraits/petra.webp",
};

/** Portrait identity belongs to the seat, not its editable display name.
 * A player can rename Mara without accidentally inheriting another face. */
export function portraitForSeat(seatId: string): string | null {
  return PORTRAIT_BY_SEAT[seatId] ?? null;
}

export function portraitAnimationDelay(seatId: string): string {
  const index = Number.parseInt(seatId.replace("seat_", ""), 10);
  return `${Number.isFinite(index) ? index * -0.73 : 0}s`;
}
