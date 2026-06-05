"use client";

import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className={cn(
        "min-h-11 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 sm:w-auto sm:border-0 sm:px-2 sm:py-1",
        focusRing
      )}
    >
      Sign out
    </button>
  );
}
