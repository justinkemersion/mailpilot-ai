"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import type { DemoPreference } from "@/lib/demo";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useState } from "react";

interface DemoPreferencesPanelProps {
  preferences: DemoPreference[];
}

export function DemoPreferencesPanel({ preferences }: DemoPreferencesPanelProps) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      {saved ? (
        <AlertBanner variant="success">
          Demo preference saved for this session (not persisted).
        </AlertBanner>
      ) : null}

      <p className="text-sm text-text-muted">
        Preview of personal preference memory — overrides are simulated in demo
        mode and are not stored.
      </p>

      <ul className="space-y-3">
        {preferences.map((pref) => (
          <li
            key={pref.id}
            className="rounded-xl border border-border-subtle bg-surface-1 p-4"
          >
            <div className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-text-primary">
                  {pref.title}
                </p>
                <p className="text-sm text-text-muted">{pref.description}</p>
                <p className="text-xs text-text-muted/90">
                  Example: {pref.example}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setSaved(true)}
        className={cn(
          "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle bg-surface-1 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2",
          focusRing
        )}
      >
        Save preference (demo)
      </button>
    </div>
  );
}
