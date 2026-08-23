import { GameView } from "@/components/GameView";

export default async function GamePage(props: PageProps<"/game/[sessionId]">) {
  const { sessionId } = await props.params;
  const search = await props.searchParams;
  const value = (key: string) => {
    const found = search[key];
    return Array.isArray(found) ? found[0] : found;
  };
  const seatId = value("seat_id");
  const accessToken = value("access_token");
  const hostToken = value("host_token");
  return (
    <GameView
      sessionId={sessionId}
      initialAccess={seatId && accessToken ? { seatId, accessToken, hostToken } : null}
    />
  );
}
