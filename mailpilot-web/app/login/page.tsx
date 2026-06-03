"use client";

import { LogIn, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

type Provider = "github" | "google";

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  async function handleSignIn(provider: Provider) {
    setLoadingProvider(provider);
    await signIn(provider, { callbackUrl: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            MailPilot
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Your AI-powered email co-pilot
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => void handleSignIn("github")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {loadingProvider === "github" ? "Signing in..." : "Sign in with GitHub"}
          </button>
          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => void handleSignIn("google")}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {loadingProvider === "google" ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
