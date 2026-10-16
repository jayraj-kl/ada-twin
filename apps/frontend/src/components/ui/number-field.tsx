import { MinusIcon, PlusIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type NumberFieldProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "min" | "max" | "step" | "size"
> & {
  /** Undefined shows an empty box. */
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  /** What − and + move by; typing can still give any value. */
  step?: number;
  /** A unit shown inside the box, after the number. */
  suffix?: string;
  size?: "sm" | "md";
};

const clamp = (value: number, min?: number, max?: number) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

/**
 * A number box with − and + pills in place of the browser's spinner arrows.
 * The arrow keys still step it, as on any number input.
 */
export function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  size = "md",
  className,
  disabled,
  ...props
}: NumberFieldProps) {
  function nudge(direction: 1 | -1) {
    const start = value ?? min ?? 0;
    // Snaps to the step's decimals, so 0.1 + 0.2 shows 0.3.
    const decimals = (String(step).split(".")[1] ?? "").length;
    const next = Number((start + direction * step).toFixed(decimals));
    onValueChange(clamp(next, min, max));
  }

  const button =
    "grid shrink-0 place-items-center rounded-full border border-transparent text-muted-foreground transition-[background-color,color,border-color,scale] outline-none hover:border-ink hover:bg-primary hover:text-[#14140f] active:scale-90 disabled:pointer-events-none disabled:opacity-35";
  const sm = size === "sm";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ink focus-within:ring-[3px] focus-within:ring-primary/60",
        sm ? "h-8 gap-0.5 px-0.5" : "h-9 gap-1 px-1",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || (min !== undefined && (value ?? min) <= min)}
        onClick={() => nudge(-1)}
        className={cn(button, sm ? "size-6" : "size-7")}
      >
        <MinusIcon className={sm ? "size-3" : "size-3.5"} strokeWidth={2.5} />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step="any"
        disabled={disabled}
        value={value === undefined || Number.isNaN(value) ? "" : value}
        onChange={(event) =>
          onValueChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
        onBlur={() => {
          if (value !== undefined) onValueChange(clamp(value, min, max));
        }}
        className={cn(
          "w-full min-w-0 flex-1 bg-transparent text-center font-mono text-sm tabular-nums outline-none",
          sm && "text-[13px]",
        )}
        {...props}
      />
      {suffix && (
        <span className="-ml-1 shrink-0 font-mono text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || (max !== undefined && (value ?? min ?? 0) >= max)}
        onClick={() => nudge(1)}
        className={cn(button, sm ? "size-6" : "size-7")}
      >
        <PlusIcon className={sm ? "size-3" : "size-3.5"} strokeWidth={2.5} />
      </button>
    </div>
  );
}
