"use client";

import {
  ACCOUNT_PURPOSE_LABELS,
  ACCOUNT_PURPOSES,
  DEFAULT_ARCHIVE_POLICY_LABELS,
  type AccountPurpose,
  type DefaultArchivePolicy,
} from "@/lib/accountScope";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface AccountScopeFieldsProps {
  accountId: number;
  purpose: AccountPurpose;
  defaultArchivePolicy: DefaultArchivePolicy;
  scopeConfigured: boolean;
  disabled?: boolean;
  onPurposeChange: (purpose: AccountPurpose) => void;
}

export function AccountScopeFields({
  accountId,
  purpose,
  defaultArchivePolicy,
  scopeConfigured,
  disabled = false,
  onPurposeChange,
}: AccountScopeFieldsProps) {
  const selectId = `purpose-${accountId}`;
  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Mailbox type</p>
        {!scopeConfigured ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Set what this inbox is for
          </span>
        ) : null}
      </div>
      <label className="sr-only" htmlFor={selectId}>
        Mailbox purpose
      </label>
      <select
        id={selectId}
        value={purpose}
        disabled={disabled}
        onChange={(e) => onPurposeChange(e.target.value as AccountPurpose)}
        className={cn(
          "w-full min-h-11 rounded-lg border border-border-subtle bg-surface-1 px-3 text-sm text-text-primary",
          focusRing,
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {ACCOUNT_PURPOSES.map((p) => (
          <option key={p} value={p}>
            {ACCOUNT_PURPOSE_LABELS[p]}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-muted">
        Resolution: {DEFAULT_ARCHIVE_POLICY_LABELS[defaultArchivePolicy]}
      </p>
    </div>
  );
}
