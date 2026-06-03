type JsonBody = Record<string, unknown> | unknown[];

function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function profileHeaderName(method: string): "Accept-Profile" | "Content-Profile" {
  return method === "GET" || method === "HEAD" ? "Accept-Profile" : "Content-Profile";
}

export function postgrestParams(
  entries: Array<[string, string | number | boolean | null | undefined]>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    params.append(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fluxFetch(
  path: string,
  init: RequestInit & { json?: JsonBody } = {}
): Promise<Response> {
  const base = requireServerEnv("NEXT_PUBLIC_FLUX_URL").replace(/\/$/, "");
  const schema = process.env.FLUX_POSTGREST_SCHEMA?.trim() || "api";
  const serviceToken = process.env.FLUX_SERVICE_TOKEN?.trim();
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  headers.set(profileHeaderName(method), schema);
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("Prefer") && method !== "GET" && method !== "HEAD") {
    headers.set("Prefer", "return=representation");
  }
  if (serviceToken) {
    headers.set("Authorization", `Bearer ${serviceToken}`);
    headers.set("apikey", serviceToken);
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    method,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
  });
}

export async function fluxJson<T>(
  path: string,
  init: RequestInit & { json?: JsonBody } = {}
): Promise<T> {
  const res = await fluxFetch(path, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Flux request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}
