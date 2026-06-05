const AVATAR_PALETTE = [
  "bg-violet-600 text-white",
  "bg-sky-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-cyan-600 text-white",
  "bg-fuchsia-600 text-white",
  "bg-lime-700 text-white",
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function accountInitial(email: string | undefined | null): string {
  if (!email) return "?";
  const local = email.split("@")[0]?.trim() || email;
  const ch = local[0];
  return ch ? ch.toUpperCase() : "?";
}

export function accountAvatarClass(email: string | undefined | null): string {
  if (!email) return "bg-zinc-500 text-white";
  const idx = hashString(email.toLowerCase()) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx] ?? AVATAR_PALETTE[0];
}
