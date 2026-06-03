#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = resolve(
  repoRoot,
  "database/supabase-export/2026-06-02/public-data.sql",
);
const defaultOutput = resolve(
  repoRoot,
  "database/supabase-export/2026-06-02/flux-data.sql",
);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const inputPath = resolve(process.env.SUPABASE_DATA_SQL ?? defaultInput);
const outputPath = resolve(process.env.FLUX_DATA_SQL ?? defaultOutput);
const oldUserId = requireEnv("OLD_USER_ID");
const newUserId = requireEnv("NEW_USER_ID");

let sql = readFileSync(inputPath, "utf8");

sql = sql
  .replace(/^SET session_replication_role = replica;\n\n/m, "")
  .replaceAll('"public"."accounts"', '"api"."accounts"')
  .replaceAll('"public"."processed_emails"', '"api"."processed_emails"')
  .replaceAll('"public"."processing_claims"', '"api"."processing_claims"')
  .replaceAll('"public"."run_jobs"', '"api"."run_jobs"')
  .replace(new RegExp(escapeRegExp(oldUserId), "g"), newUserId)
  .replace(
    /SELECT pg_catalog\.setval\('"?api"?\."?accounts_id_seq"?'::regclass, ([0-9]+), true\);/g,
    "SELECT pg_catalog.setval(pg_get_serial_sequence('api.accounts', 'id'), $1, true);",
  )
  .replace(
    /SELECT pg_catalog\.setval\('"?api"?\."?processed_emails_id_seq"?'::regclass, ([0-9]+), true\);/g,
    "SELECT pg_catalog.setval(pg_get_serial_sequence('api.processed_emails', 'id'), $1, true);",
  )
  .replace(
    /SELECT pg_catalog\.setval\('"?api"?\."?processing_claims_id_seq"?'::regclass, ([0-9]+), true\);/g,
    "SELECT pg_catalog.setval(pg_get_serial_sequence('api.processing_claims', 'id'), $1, true);",
  )
  .replace(
    /SELECT pg_catalog\.setval\('"?api"?\."?run_jobs_id_seq"?'::regclass, ([0-9]+), true\);/g,
    "SELECT pg_catalog.setval(pg_get_serial_sequence('api.run_jobs', 'id'), $1, true);",
  );

writeFileSync(outputPath, sql, { mode: 0o600 });
console.log(`Wrote transformed Flux data SQL to ${outputPath}`);
