const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Short date/time string identical on server (SSR) and browser.
 * Uses UTC so we avoid Node vs browser locale/timezone differences (hydration bugs).
 */
export function formatMailpilotDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const mon = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  let h = d.getUTCHours();
  const min = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = min.toString().padStart(2, "0");
  return `${mon} ${day}, ${h}:${mm} ${ampm} UTC`;
}
