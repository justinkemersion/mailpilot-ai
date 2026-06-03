import { LogIn, Mail } from "lucide-react";

const CALLBACK_URL = "/dashboard";

export function LoginForm({
  csrfToken,
  error,
}: {
  csrfToken: string | null;
  error?: string | null;
}) {
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
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          {!csrfToken ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Could not start sign-in. Reload the page and try again.
            </p>
          ) : (
            <>
              <form
                action="/api/auth/signin/github"
                method="POST"
                className="touch-manipulation"
              >
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="callbackUrl" value={CALLBACK_URL} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in with GitHub
                </button>
              </form>

              <form
                action="/api/auth/signin/google"
                method="POST"
                className="touch-manipulation"
              >
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="callbackUrl" value={CALLBACK_URL} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Sign in with Google
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
