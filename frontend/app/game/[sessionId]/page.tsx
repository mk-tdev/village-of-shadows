import { GameView } from "@/components/GameView";

export default async function GamePage(props: PageProps<"/game/[sessionId]">) {
  const { sessionId } = await props.params;
  return <GameView sessionId={sessionId} />;
}
