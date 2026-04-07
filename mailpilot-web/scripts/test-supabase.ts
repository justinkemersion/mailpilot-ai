/**
 * Validates that .env.local contains working Supabase credentials.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Postgres undefined_table, or PostgREST "not in schema cache" (table missing / not exposed). */
function isMissingTableError(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

function checkEnvVars(): { url: string; anonKey: string } | never {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error("FAIL — missing environment variables:");
    missing.forEach((v) => console.error(`  • ${v}`));
    console.error(
      "\nMake sure you have a .env.local file with these values.\n" +
        "See .env.local.example for the required keys."
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
    console.error(
      `FAIL — NEXT_PUBLIC_SUPABASE_URL looks wrong: "${url}"\n` +
        "Expected format: https://<project-ref>.supabase.co"
    );
    process.exit(1);
  }

  return { url, anonKey };
}

async function main() {
  console.log("MailPilot — Supabase credential check\n");

  const { url, anonKey } = checkEnvVars();
  console.log(`  URL:      ${url}`);
  console.log(`  Anon key: ${anonKey.slice(0, 20)}…\n`);

  const supabase = createClient(url, anonKey);
  let schemaWarnings = 0;

  // Check 1: reachability — query a table we know exists after running schema.sql.
  // PostgREST returns PGRST205 when the table is missing from its schema cache (typical
  // if schema.sql has not been run yet); Postgres would use 42P01 for undefined_table.
  console.log("Check 1: connecting to Supabase…");
  const { error: pingError } = await supabase
    .from("accounts")
    .select("id")
    .limit(1);

  if (pingError) {
    if (isMissingTableError(pingError.code)) {
      schemaWarnings += 1;
      console.warn(
        "  WARN — API reached your project, but `public.accounts` is not available yet.\n" +
          "  In Dashboard → SQL Editor, run the contents of mailpilot-web/supabase/schema.sql.\n" +
          "  (CLI: `supabase db push` only works after `supabase link --project-ref <ref>`.)"
      );
    } else {
      console.error("  FAIL — Could not reach Supabase:");
      console.error(`  ${pingError.message} (code: ${pingError.code})`);
      process.exit(1);
    }
  } else {
    console.log("  OK — `accounts` table reachable.");
  }

  // Check 2: confirm processed_emails table exists too.
  console.log("Check 2: checking `processed_emails` table…");
  const { error: emailsError } = await supabase
    .from("processed_emails")
    .select("id")
    .limit(1);

  if (emailsError) {
    if (isMissingTableError(emailsError.code)) {
      schemaWarnings += 1;
      console.warn(
        "  WARN — `public.processed_emails` is not available yet.\n" +
          "  Run mailpilot-web/supabase/schema.sql in the Supabase SQL Editor."
      );
    } else {
      console.error("  FAIL — Could not query `processed_emails`:");
      console.error(`  ${emailsError.message} (code: ${emailsError.code})`);
      process.exit(1);
    }
  } else {
    console.log("  OK — `processed_emails` table reachable.");
  }

  if (schemaWarnings > 0) {
    console.log(
      "\nCredentials look fine. Apply the schema (above), then run this script again for a full green check."
    );
  } else {
    console.log("\nAll checks passed. Supabase is configured correctly.");
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
