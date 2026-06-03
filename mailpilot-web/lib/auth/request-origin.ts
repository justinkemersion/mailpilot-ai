/** Next.js may normalize request.url to localhost; use Host headers instead. */
export function requestOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host");
  if (!host) {
    return new URL(request.url).origin;
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
