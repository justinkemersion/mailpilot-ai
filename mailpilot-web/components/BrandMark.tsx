import { cn } from "@/lib/utils";

interface BrandMarkProps {
  size?: "sm" | "md";
  className?: string;
}

export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const dim = size === "sm" ? 28 : 32;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" className="fill-indigo-600 dark:fill-indigo-500" />
      <path
        d="M8 11.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
        className="stroke-white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.5 16 18l8-5.5"
        className="stroke-white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="9" r="2.5" className="fill-amber-300" />
    </svg>
  );
}
