import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Supabase Auth redirect target.
 * Called after a user clicks the confirmation link in their email.
 * Exchanges the one-time `code` for a session, then sends the user to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send the user back to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
