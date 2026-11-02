import type { Metadata } from "next";
import PresentationContent from "./PresentationContent";

export const metadata: Metadata = {
  title: "Village of Shadows | Project Overview",
  description:
    "Village of Shadows is a playable multi-agent AI learning lab where learners predict, participate, inspect, explain, and replay agent behavior.",
};

export default function PresentationPage() {
  return <PresentationContent />;
}
