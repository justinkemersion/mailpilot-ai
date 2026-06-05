import { AlertBanner } from "@/components/ui/AlertBanner";
import { BrandMark } from "@/components/BrandMark";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
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
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="md" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">
            MailPilot
          </h1>
          <p className="mt-1 text-sm text-text-muted">AI inbox automation</p>
        </div>

        <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-1 p-8 shadow-sm">
          {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}

          {!csrfToken ? (
            <AlertBanner variant="error">
              Could not start sign-in. Reload the page and try again.
            </AlertBanner>
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
                  className={cn(
                    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover",
                    focusRing
                  )}
                >
                  <LogIn className="h-4 w-4" aria-hidden />
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
                  className={cn(
                    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2",
                    focusRing
                  )}
                >
                  <Mail className="h-4 w-4" aria-hidden />
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
