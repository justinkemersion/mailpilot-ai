import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    reconnected?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.connected) query.set("connected", params.connected);
  if (params.reconnected) query.set("reconnected", params.reconnected);
  if (params.error) query.set("error", params.error);
  const qs = query.toString();
  redirect(`/dashboard/overview${qs ? `?${qs}` : ""}`);
}
