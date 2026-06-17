import { DemoPreferencesPanel } from "@/components/DemoPreferencesPanel";
import { SettingsCategoriesPanel } from "@/components/SettingsCategoriesPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/auth/session";
import { DEMO_PREFERENCES, isDemoUser } from "@/lib/demo";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const demo = isDemoUser(user);

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Settings
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {demo
            ? "Preview preference memory with sample overrides."
            : "Category defaults and mailbox scope for inbox resolution."}
        </p>
      </div>
      {demo ? (
        <DemoPreferencesPanel preferences={DEMO_PREFERENCES} />
      ) : (
        <SettingsCategoriesPanel />
      )}
    </section>
  );
}
