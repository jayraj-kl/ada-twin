import { useEffect, useEffectEvent, useRef } from "react";
import HL from "./hairline/kernel.js";
import { copyFloor } from "./hairline/copy-floor.js";

/**
 * The hero's figure: the boiler room and its copy, drawn with the
 * hairline-create kernel. It mounts the way the package mounts its own
 * figures, and walks its tour until a pointer arrives, as `play` does.
 */
export function CopyFloor({
  onRead,
  className,
}: {
  onRead?: (text: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const report = useEffectEvent((text: string) => onRead?.(text));

  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    HL.inject(document);
    const svg = HL.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);
    let text: string | null = null;
    const read = {
      get textContent() {
        return text;
      },
      set textContent(value: string | null) {
        text = value ?? "";
        report(text);
      },
    };
    const figure = copyFloor.mount({ stage, svg, read }, copyFloor.range[1]);
    const lap = HL.tour(stage, copyFloor.tour);
    return () => {
      lap.stop();
      figure.destroy();
      svg.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-hairline={copyFloor.name}
      role="img"
      aria-label="The boiler room on two plinths: the plant behind, its copy in front. Pointing at a station on the copy adds a second unit there, and the plant never moves."
      className={className}
    />
  );
}
