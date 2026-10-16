import { Link } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Two offset squares, one solid and one drawn: the plant and its twin. The
 * same drawing is the favicon (public/adatwin-mark.svg).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0 rounded-[9px] dark:ring-1 dark:ring-white/15", className)}
    >
      <rect width="32" height="32" rx="8" fill="#14140f" />
      <rect x="7" y="7" width="12" height="12" rx="2.5" fill="#beff50" />
      <rect
        x="13"
        y="13"
        width="12"
        height="12"
        rx="2.5"
        fill="none"
        stroke="#beff50"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Logo({
  to = "/",
  compact,
}: {
  to?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <LogoMark />
      <span
        className={cn(
          "text-lg font-semibold tracking-[-0.02em]",
          compact && "hidden sm:inline",
        )}
      >
        Ada<span className="text-muted-foreground">Twin</span>
      </span>
    </Link>
  );
}
