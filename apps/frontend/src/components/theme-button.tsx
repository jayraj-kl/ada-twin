import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";

/** The toggle as it sits in every top bar. */
export function ThemeButton() {
  return (
    <div className="grid size-10 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-ink">
      <AnimatedThemeToggler className="size-5" />
    </div>
  );
}
