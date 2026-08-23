import { ReplayViewer } from "@/components/ReplayViewer";

export default async function ReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareId: string }>;
  searchParams: Promise<{ secret?: string }>;
}) {
  const [{ shareId }, { secret }] = await Promise.all([params, searchParams]);
  return <ReplayViewer shareId={shareId} secret={secret} />;
}
