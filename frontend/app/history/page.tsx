import type { Metadata } from "next";
import { GameArchive } from "@/components/GameArchive";

export const metadata: Metadata = {
  title: "Game Archive | Village of Shadows",
  description: "Private operator archive for Village of Shadows sessions.",
};

export default function HistoryPage() {
  return <GameArchive />;
}
