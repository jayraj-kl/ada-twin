import type { TracedPiece } from "@repo/sim";
import { cn } from "@/lib/utils";

import { t } from "@/lib/i18n";
export const MISS = t("Not found in this run's numbers");

/**
 * Written text with each number marked by what it was traced to: a faint
 * dotted underline naming its source, or a warning underline when it matches
 * nothing the writer was given. Only the warnings print.
 */
export function TracedText({ pieces }: { pieces: TracedPiece[] }) {
  return pieces.map((piece, index) =>
    piece.number ? (
      <span
        key={index}
        title={piece.source ?? MISS}
        className={cn(
          "underline decoration-dotted underline-offset-[3px]",
          piece.source
            ? "decoration-muted-foreground/50 print:no-underline"
            : "decoration-warning decoration-2",
        )}
      >
        {piece.text}
      </span>
    ) : (
      <span key={index}>{piece.text}</span>
    ),
  );
}
