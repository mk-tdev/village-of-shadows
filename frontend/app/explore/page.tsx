import type { Metadata } from "next";
import ExplorationLoader from "@/components/exploration/ExplorationLoader";

export const metadata: Metadata = {
  title: "The Last Light | Village of Shadows",
  description: "Walk the empty village, follow the lanterns, and uncover what happened before the council. A playable first-person horror prologue.",
};

export default function ExplorePage() { return <ExplorationLoader />; }
