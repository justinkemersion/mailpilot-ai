"use client";

import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

interface SignOutButtonProps {
  variant?: "header" | "sidebar";
  className?: string;
}

export function SignOutButton({
  variant = "header",
  className,
}: SignOutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className={cn(
        "text-sm transition-colors",
        focusRing,
        variant === "sidebar"
          ? "mt-1 min-h-11 w-full rounded-lg px-2 py-2 text-left text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          : "min-h-11 rounded-lg border border-zinc-200 px-3 py-2 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
        className
      )}
    >
      Sign out
    </button>
  );
}
