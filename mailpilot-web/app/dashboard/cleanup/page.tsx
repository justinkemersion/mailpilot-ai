import { CleanupQueue } from "@/components/CleanupQueue";
import { getCurrentUser } from "@/lib/auth/session";
import { getCleanupGroups } from "@/lib/dashboard/queries";
import { redirect } from "next/navigation";

export default async function CleanupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groups = await getCleanupGroups(user.id);

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cleanup
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Resolve labeled mail that is still waiting in the inbox.
        </p>
      </div>
      <CleanupQueue initialGroups={groups} />
    </section>
  );
}
