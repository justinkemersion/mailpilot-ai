import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.connected) query.set("connected", params.connected);
  if (params.error) query.set("error", params.error);
  const qs = query.toString();
  redirect(`/dashboard/overview${qs ? `?${qs}` : ""}`);
}
