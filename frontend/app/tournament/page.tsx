import type { Metadata } from "next";
import { TournamentLab } from "@/components/TournamentLab";

export const metadata: Metadata = {
  title: "Model Tournament | Village of Shadows",
  description: "Run balanced, budget-bounded multi-agent Werewolf tournaments.",
};

export default function TournamentPage() {
  return <TournamentLab />;
}
