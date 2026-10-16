import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-none transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-primary/60 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-20", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("text-[13px] font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
