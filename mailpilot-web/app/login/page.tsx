import { readCsrfTokenFromCookies } from "@/lib/auth/csrf";
import { getCurrentUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const cookieStore = await cookies();
  let csrfToken = readCsrfTokenFromCookies(cookieStore);

  if (!csrfToken && params.error !== "csrf") {
    redirect("/api/login/bootstrap");
  }

  let error: string | null = null;
  if (params.error === "csrf") {
    error = "Could not start sign-in. Reload the page and try again.";
  } else if (params.error === "OAuthSignin" || params.error === "OAuthCallback") {
    error = "Sign-in failed. Try again or use the other provider.";
  } else if (params.error) {
    error = "Sign-in failed. Please try again.";
  }

  if (!csrfToken && !error) {
    csrfToken = readCsrfTokenFromCookies(await cookies());
  }

  return <LoginForm csrfToken={csrfToken} error={error} />;
}
