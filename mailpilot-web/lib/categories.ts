export const CATEGORY_COLORS: Record<string, string> = {
  important: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  work: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  personal: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  newsletters: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  promotions: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  receipts: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400",
  spam: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export const CATEGORY_ORDER = [
  "important",
  "work",
  "personal",
  "newsletters",
  "promotions",
  "receipts",
  "spam",
] as const;

export function categoryBadgeClass(category: string): string {
  return (
    CATEGORY_COLORS[category] ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
  );
}

export function sortCategoriesUnique(cats: string[]): string[] {
  const seen = new Set<string>();
  const fromOrder: string[] = [];
  for (const c of CATEGORY_ORDER) {
    if (cats.includes(c) && !seen.has(c)) {
      seen.add(c);
      fromOrder.push(c);
    }
  }
  const rest = cats.filter((c) => !seen.has(c)).sort((a, b) => a.localeCompare(b));
  return [...fromOrder, ...rest];
}
