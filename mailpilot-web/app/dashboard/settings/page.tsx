import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/auth/session";
import { Settings } from "lucide-react";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Settings
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          Account and automation preferences will appear here.
        </p>
      </div>
      <EmptyState
        icon={Settings}
        title="Settings coming soon"
        description="Classifier configuration and runner preferences will be surfaced here when available."
      />
    </section>
  );
}
