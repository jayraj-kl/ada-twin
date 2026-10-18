import { CircleHelpIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motionTokens, springs } from "@/lib/motion";
import { STEPS, type StepSlug, stepIndex } from "@/lib/projects";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { TOURS, type TourStop } from "./stops";
import { endTour, hasSeenTour, startTour, useOpenTour } from "./store";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Room around the highlighted element, the gap to the card, and the screen edge.
const PAD = 6;
const GAP = 14;
const EDGE = 16;
const CARD_PX = 340;

/** The element a stop points at, when it is on screen to be pointed at. */
function find(stop: TourStop): HTMLElement | null {
  if (!stop.target) return null;
  const element = document.querySelector<HTMLElement>(
    `[data-tour="${stop.target}"]`,
  );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  // Zero-sized, or slid off the side like a closed drawer.
  if (rect.width === 0 || rect.height === 0) return null;
  if (rect.right <= 0 || rect.left >= window.innerWidth) return null;
  return element;
}

/** The element's box with room around it, kept on screen. */
function frame(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  const left = Math.max(rect.left - PAD, 4);
  const top = Math.max(rect.top - PAD, 4);
  const right = Math.min(rect.right + PAD, window.innerWidth - 4);
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 4);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Below the element, else above, else beside it, else at the bottom. */
function place(box: Box | null, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), vw - width - EDGE);
  const clampY = (y: number) =>
    Math.min(Math.max(y, EDGE), vh - height - EDGE);
  if (!box) return { x: clampX((vw - width) / 2), y: clampY((vh - height) / 2) };
  const x = clampX(box.x + box.w / 2 - width / 2);
  if (box.y + box.h + GAP + height <= vh - EDGE)
    return { x, y: box.y + box.h + GAP };
  if (box.y - GAP - height >= EDGE) return { x, y: box.y - GAP - height };
  const y = clampY(box.y + box.h / 2 - height / 2);
  if (box.x - GAP - width >= EDGE) return { x: box.x - GAP - width, y };
  if (box.x + box.w + GAP + width <= vw - EDGE)
    return { x: box.x + box.w + GAP, y };
  return { x: clampX((vw - width) / 2), y: vh - height - EDGE };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h);

/**
 * Shows a page around the first time it opens, and again from the ? button.
 * Mounted once by the project layout, for the step on screen.
 */
export function ProductTour({ step }: { step: StepSlug }) {
  const open = useOpenTour();

  // Once the page has settled in, so what it points at is there.
  useEffect(() => {
    if (hasSeenTour(step)) return;
    const timer = window.setTimeout(() => startTour(step), 700);
    return () => window.clearTimeout(timer);
  }, [step]);

  // Leaving the page ends its tour.
  useEffect(() => {
    if (open && open !== step) endTour();
  }, [open, step]);

  if (open !== step) return null;
  return createPortal(<TourRun key={step} step={step} />, document.body);
}

function TourRun({ step }: { step: StepSlug }) {
  const stops = TOURS[step];
  const reduced = useReducedMotion();
  const card = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Which stops can be shown now, the highlighted box, and the card's size.
  const [present, setPresent] = useState<number[]>(() =>
    stops.flatMap((stop, at) => (!stop.target || find(stop) ? [at] : [])),
  );
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: CARD_PX, h: 220 });

  const at = Math.min(index, present.length - 1);
  const stop = stops[present[at]!]!;
  const last = at === present.length - 1;
  const next = STEPS[stepIndex(step) + 1];

  // Follows the page as it scrolls, resizes and animates.
  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const now = stops.flatMap((one, where) =>
        !one.target || find(one) ? [where] : [],
      );
      setPresent((before) =>
        before.join() === now.join() ? before : now,
      );
      const element = find(stop);
      const nextBox = element ? frame(element) : null;
      setBox((before) => (sameBox(before, nextBox) ? before : nextBox));
      if (card.current) {
        const w = card.current.offsetWidth;
        const h = card.current.offsetHeight;
        setSize((before) =>
          before.w === w && before.h === h ? before : { w, h },
        );
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [stops, stop]);

  // Brings each stop into view, and the reader's focus to the card.
  useEffect(() => {
    const element = find(stop);
    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.top < 80 || rect.bottom > window.innerHeight - 24)
        element.scrollIntoView({
          block: "center",
          behavior: reduced ? "auto" : "smooth",
        });
    }
    card.current?.focus({ preventScroll: true });
  }, [stop, reduced]);

  // The tour ends only from its last card. Only an intro card means the page
  // has nothing to show yet, so it is shown again later.
  const forward = () =>
    last ? endTour(present.length > 1) : setIndex(at + 1);
  const back = () => setIndex(Math.max(at - 1, 0));

  // Ahead of the page's own keys, which stay quiet while the tour is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action =
        event.key === "Escape"
          ? () => {}
          : event.key === "ArrowRight"
            ? forward
            : event.key === "ArrowLeft"
              ? back
              : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const spot = place(box, size.w, size.h);

  return (
    <div className="fixed inset-0 z-[60] print:hidden">
      {/* Holds the page still while it is being shown. */}
      <div className="absolute inset-0" aria-hidden />
      <AnimatePresence initial={false}>
        {box ? (
          <motion.div
            key="spotlight"
            aria-hidden
            initial={{ opacity: 0, ...pos(box) }}
            animate={{ opacity: 1, ...pos(box) }}
            exit={{ opacity: 0 }}
            transition={springs.snappy}
            className="pointer-events-none absolute top-0 left-0 rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_rgb(20_20_15/0.6)]"
          />
        ) : (
          <motion.div
            key="dim"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionTokens.duration.fast }}
            className="pointer-events-none absolute inset-0 bg-[#14140f]/60"
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        initial={{ opacity: 0, scale: motionTokens.scale.press, ...spot }}
        animate={{ opacity: 1, scale: 1, ...spot }}
        transition={springs.snappy}
        className="absolute top-0 left-0 w-[min(340px,calc(100vw-32px))] rounded-3xl border border-ink bg-card p-5 text-card-foreground shadow-hard outline-none"
      >
        <span className={ui.eyebrow}>
          {STEPS[stepIndex(step)]!.label} · {at + 1} of {present.length}
        </span>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={present[at]}
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -motionTokens.distance.sm }}
            transition={{
              duration: motionTokens.duration.fast,
              ease: motionTokens.easing.smooth,
            }}
          >
            <h2
              id="tour-title"
              className="mt-3 text-lg leading-tight font-bold tracking-[-0.02em]"
            >
              {stop.title}
            </h2>
            <p id="tour-body" className="mt-1.5 text-sm text-muted-foreground">
              {stop.body}
            </p>
            {last && next && (
              <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Next up · {next.label}
                </span>{" "}
                · {next.blurb}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-hidden>
            {present.map((where, dot) => (
              <span
                key={where}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  dot === at
                    ? "w-5 bg-primary ring-1 ring-ink"
                    : dot < at
                      ? "w-1.5 bg-ink"
                      : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {at > 0 && (
              <button type="button" className={ui.button} onClick={back}>
                Back
              </button>
            )}
            <button
              type="button"
              className={cn(ui.primary, "hover:-translate-y-px hover:shadow-hard-sm")}
              onClick={forward}
            >
              {last ? "Got it" : at === 0 ? "Show me" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const pos = (box: Box) => ({ x: box.x, y: box.y, width: box.w, height: box.h });

/** Replays the tour of the step on screen. */
export function TourButton({ step }: { step: StepSlug }) {
  return (
    <button
      type="button"
      onClick={() => startTour(step)}
      aria-label="Show me around this page"
      title="Show me around this page"
      className="grid size-10 place-items-center rounded-full border border-border bg-card text-foreground outline-none transition-colors hover:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <CircleHelpIcon className="size-5" />
    </button>
  );
}
