import { RoomLobby } from "@/components/RoomLobby";

export default async function RoomPage(props: PageProps<"/room/[sessionId]">) {
  const { sessionId } = await props.params;
  const search = await props.searchParams;
  const one = (key: string) => Array.isArray(search[key]) ? search[key][0] : search[key];
  const seatId = one("seat_id") ?? "";
  const accessToken = one("access_token") ?? "";
  const hostToken = one("host_token") ?? "";
  return <RoomLobby sessionId={sessionId} access={{ seatId, accessToken, hostToken }} />;
}
