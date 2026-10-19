import {
  Branches,
  Hub,
  Settle,
  Slow,
  Terminal,
  Terrain,
  type HairlineProps,
} from "@lucasmarkes/hairline/react";
import { useState, type ComponentType } from "react";
import type { STEPS } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Slug = (typeof STEPS)[number]["slug"];

// The package is one module of every figure, so this file loads on its own,
// after the landing page has drawn.
const FIGURES: Record<Slug, { Figure: ComponentType<HairlineProps>; label: string }> = {
  capture: {
    Figure: Terrain,
    label: "Pillars rise from a flat plinth around the pointer, as photos rise into a 3D world.",
  },
  twin: {
    Figure: Slow,
    label: "Crates ride a belt through a gate. Hovering slows the line so it can be read.",
  },
  scenario: {
    Figure: Terminal,
    label: "A terminal window. The pointer's height scrolls back through its lines.",
  },
  agents: {
    Figure: Hub,
    label: "A hub with eight tiles around it. The tile under the pointer rises and its link turns solid.",
  },
  results: {
    Figure: Branches,
    label: "A branch forks off a line of commits and merges back, like a change tested on a copy.",
  },
  plant: {
    Figure: Settle,
    label: "Crooked tiles slide into an ordered tree as the pointer nears.",
  },
};

/** A step's figure, drawn straight on the steps panel, with the figure's caption under it. */
export default function StepFigure({ slug, className }: { slug: Slug; className?: string }) {
  const { Figure, label } = FIGURES[slug];
  const [read, setRead] = useState("rest");
  return (
    <figure className={cn("hairline-on-lime [--lime-ground:#a9cd79]", className)}>
      <Figure play label={label} onRead={setRead} />
      <figcaption className="mt-2 flex h-4 justify-end font-mono text-xs text-[#14140f]/70">
        {read}
      </figcaption>
    </figure>
  );
}
