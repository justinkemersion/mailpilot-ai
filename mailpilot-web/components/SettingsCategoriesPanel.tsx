import {
  ACTION_POLICY_LABELS,
  SAFETY_TIER_LABELS,
  SYSTEM_CATEGORY_POLICIES,
} from "@/lib/categoryPolicy";
import { CategoryPill } from "@/components/ui/CategoryPill";

export function SettingsCategoriesPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Default resolution policy per category. MailPilot labels mail first; archive
        happens only after you approve rules or use Cleanup (Phase 9). Account-wide
        archive is not available.
      </p>
      <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-1">
        {SYSTEM_CATEGORY_POLICIES.map((cat) => (
          <li
            key={cat.slug}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CategoryPill category={cat.slug} />
              <span className="text-sm font-medium text-text-primary">{cat.name}</span>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-text-muted sm:text-right">
              <span>{ACTION_POLICY_LABELS[cat.defaultAction]}</span>
              <span>{SAFETY_TIER_LABELS[cat.safetyTier]}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
