import { categoryBadgeClass } from "@/lib/categories";
import { cn } from "@/lib/utils";

interface CategoryPillProps {
  category: string;
  size?: "sm" | "md";
}

export function CategoryPill({ category, size = "sm" }: CategoryPillProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full font-medium capitalize",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        categoryBadgeClass(category)
      )}
    >
      {category}
    </span>
  );
}
