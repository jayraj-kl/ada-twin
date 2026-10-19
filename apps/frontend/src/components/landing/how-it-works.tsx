import { AnimatePresence, motion, useInView } from "motion/react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionTokens } from "@/lib/motion";
import { STEPS } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Slug = (typeof STEPS)[number]["slug"];

const LazyStepFigure = lazy(() => import("./step-figure"));

/** What each step does, as the landing page tells it. */
const BODY: Record<Slug, string> = {
  capture:
    "Upload 360° panoramas of your floor. World Labs Marble turns them into a 3D world you can walk through.",
  twin: "List your machines and how material moves between them. Gemini drafts the flow from your description and finds the machines in your photos.",
  scenario:
    "Write the conditions to test in plain words: a heatwave, a rush order, half the maintenance team off sick.",
  agents:
    "Put a crew on the floor: a planner, technicians and a supervisor, each with a personality of their own.",
  results:
    "Run the shift and watch the crew decide in 3D. Compare it with standard rules over many simulated days, then test changes on a copy of your twin.",
  plant:
    "See the changes that worked, ranked by how much they matter, with Nano Banana drawing them into photos of your plant.",
};

/** What each step leaves behind, in the words the app saves it under. */
const KEEPS: Record<Slug, string> = {
  capture: "world.spz · collider.glb · pano.png",
  twin: "boiler-1 → boiler-2 → boiler-3",
  scenario: "Hot week, full order book · 34 °C",
  agents: "planner · technicians · supervisor",
  results: "10 days by default, up to 60",
  plant: "applied changes, ranked",
};

// Wide screens (min-[1101px]) walk the steps one at a time: each holds a
// screen of its own, the one mid-screen lights up, and its figure stands in
// the sticky column. Narrower, each step shows its figure under it.

type Arc = { width: number; height: number; d: string; dots: [number, number][] };

/**
 * The near half of an ellipse whose far side runs off the panel's left edge,
 * through every station's heading, like a motion study's light path. It is
 * measured from the headings as laid out, so it follows the type.
 */
function traceArc(wrap: HTMLElement): Arc | null {
  const box = wrap.getBoundingClientRect();
  const ys = [...wrap.querySelectorAll("h3")].map((h) => {
    const r = h.getBoundingClientRect();
    return r.top - box.top + r.height * 0.55;
  });
  if (!ys.length) return null;
  const rx = Math.max(24, parseFloat(getComputedStyle(wrap).paddingLeft) - 28);
  const cx = 6, top = Math.min(...ys) - 40, bottom = Math.max(...ys) + 40;
  const cy = (top + bottom) / 2, ry = (bottom - top) / 2;
  return {
    width: box.width,
    height: box.height,
    d: `M ${cx} ${top} A ${rx} ${ry} 0 0 1 ${cx} ${bottom}`,
    dots: ys.map((y) => {
      const t = Math.max(-1, Math.min(1, (y - cy) / ry));
      return [cx + rx * Math.sqrt(1 - t * t), y];
    }),
  };
}

/** The figure, with an empty space of the same size while its module loads. */
function StepFigure({ slug, className }: { slug: Slug; className?: string }) {
  return (
    <Suspense
      fallback={
        <div className={className}>
          <div className="aspect-[5/4]" />
          <div className="mt-2 h-4" />
        </div>
      }
    >
      <LazyStepFigure slug={slug} className={className} />
    </Suspense>
  );
}

/** One station on the arc. On wide screens it marks itself active while it sits mid-screen. */
function Step({
  step,
  active,
  onActive,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  onActive: (slug: Slug) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inView) onActive(step.slug);
  }, [inView, step.slug, onActive]);

  return (
    <li ref={ref} className="min-[1101px]:flex min-[1101px]:min-h-[60svh] min-[1101px]:items-center">
      <div
        className={cn(
          "w-full transition-opacity duration-500",
          !active && "min-[1101px]:opacity-40",
        )}
      >
        <h3 className="font-display text-[clamp(1.75rem,3vw,3rem)] leading-[1.05] font-medium tracking-[-0.01em]">
          {step.label}
        </h3>
        <p className="mt-3 max-w-[44ch] text-pretty text-[#14140f]/75">{BODY[step.slug]}</p>
        <p className="mt-3 font-mono text-xs">{KEEPS[step.slug]}</p>
        <StepFigure slug={step.slug} className="mt-6 min-[1101px]:hidden" />
      </div>
    </li>
  );
}

export function HowItWorks() {
  const wrap = useRef<HTMLDivElement>(null);
  const [arc, setArc] = useState<Arc | null>(null);
  const [slug, setSlug] = useState<Slug>("capture");
  const active = STEPS.findIndex((step) => step.slug === slug);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const draw = () => setArc(traceArc(el));
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    void document.fonts?.ready.then(draw);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="steps"
      aria-labelledby="steps-title"
      className="relative isolate bg-[#a9cd79] px-(--g) py-[clamp(72px,9vw,130px)] text-[#14140f]"
    >
      <div className="mb-[clamp(48px,6vw,88px)] grid items-end gap-x-(--g) gap-y-6 min-[761px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <h2
          id="steps-title"
          className="font-display text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-medium tracking-[-0.02em] text-balance"
        >
          Six steps on one path.
        </h2>
        <p className="max-w-[58ch] text-pretty text-[#14140f]/75">
          A project moves from photos of your floor to a ranked list of changes, one page per step.
          Each step keeps what the one before it found. Point at any drawing to play with it.
        </p>
      </div>

      <div className="grid gap-[clamp(40px,6vw,96px)] min-[1101px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div ref={wrap} className="relative pl-12 min-[761px]:pl-[clamp(120px,16vw,240px)]">
          {arc && (
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${arc.width} ${arc.height}`}
              className="absolute inset-0 size-full overflow-visible"
            >
              <path d={arc.d} fill="none" stroke="#14140f" strokeOpacity={0.7} />
              {arc.dots.map(([x, y], index) => (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={index === active ? 7 : 5}
                  className="transition-[r,fill] duration-300"
                  fill={index === active ? "#14140f" : "#a9cd79"}
                  stroke="#14140f"
                  strokeWidth={1.5}
                />
              ))}
            </svg>
          )}
          <ol className="relative grid gap-[clamp(48px,6vw,72px)] min-[1101px]:gap-0">
            {STEPS.map((step) => (
              <Step key={step.slug} step={step} active={step.slug === slug} onActive={setSlug} />
            ))}
          </ol>
        </div>

        <div className="hidden min-[1101px]:block">
          <div className="sticky top-[max(2rem,calc(50svh-17rem))] mx-auto max-w-[620px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={slug}
                initial={{ opacity: 0, y: motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -motionTokens.distance.sm }}
                transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
              >
                <StepFigure slug={slug} />
              </motion.div>
            </AnimatePresence>
            <p className="mt-4 font-mono text-xs text-[#14140f]/70">
              {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")} ·{" "}
              {STEPS[active]?.label}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
