import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-semibold whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-150 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The signal: lime with an ink outline that lifts onto a hard shadow.
        default:
          "border-ink bg-primary text-primary-foreground hover:border-ink hover:bg-primary-hover hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard active:translate-0 active:shadow-none",
        ink: "border-ink bg-ink text-background hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--primary)] active:translate-0 active:shadow-none",
        outline:
          "border-border bg-card text-foreground hover:border-ink hover:bg-accent",
        ghost:
          "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "border-destructive bg-card text-destructive hover:bg-destructive hover:text-white",
        link: "border-transparent px-0 text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-[13px]",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
