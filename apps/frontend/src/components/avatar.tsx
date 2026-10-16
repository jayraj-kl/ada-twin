import * as notionists from "@dicebear/notionists";
import { createAvatar } from "@dicebear/core";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function avatarUri(seed: string) {
  return createAvatar(notionists, {
    seed,
    backgroundColor: ["beff50", "e4f5c4", "ffe7a3", "d9e8ff", "ffd6cc"],
    backgroundType: ["solid"],
  }).toDataUri();
}

export function Avatar({
  seed,
  className,
  alt = "",
}: {
  seed: string;
  className?: string;
  alt?: string;
}) {
  const src = useMemo(() => avatarUri(seed), [seed]);
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn("size-9 shrink-0 rounded-full border-2 border-ink bg-card", className)}
    />
  );
}
