/**
 * Smoke-test Flux PostgREST credentials from mailpilot-web env.
 *
 *   npx tsx --env-file=.env.local scripts/test-flux.ts
 */

const required = [
  "NEXT_PUBLIC_FLUX_URL",
  "FLUX_SERVICE_TOKEN",
] as const;

for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`FAIL — missing ${key}`);
    process.exit(1);
  }
}

const base = process.env.NEXT_PUBLIC_FLUX_URL!.replace(/\/$/, "");
const token = process.env.FLUX_SERVICE_TOKEN!.trim();
const schema = process.env.FLUX_POSTGREST_SCHEMA?.trim() || "api";

const url = `${base}/accounts?select=id&limit=1`;

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: token,
    "Accept-Profile": schema,
  },
});

if (!res.ok) {
  const body = await res.text();
  console.error(`FAIL — Flux HTTP ${res.status}: ${body.slice(0, 400)}`);
  process.exit(1);
}

const rows = await res.json();
console.log(`OK — Flux reachable (${schema}.accounts sample: ${JSON.stringify(rows).slice(0, 120)}…)`);
