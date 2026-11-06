import type { Metadata } from "next";
import ExplorationLoader from "@/components/exploration/ExplorationLoader";

export const metadata: Metadata = {
  title: "The Last Light | Village of Shadows",
  description: "Explore a haunted forest, ruined moon temple, abandoned houses and whispering waterfall. Follow the lanterns back to the AI council in this playable horror prologue.",
};

export default function ExplorePage() { return <ExplorationLoader />; }
