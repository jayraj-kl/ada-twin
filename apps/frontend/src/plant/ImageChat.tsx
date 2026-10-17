import {
  ArrowUpIcon,
  CheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  ImageIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { motionTokens, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { PlantView } from "./views";

export interface PlantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The images drawn for this answer, by id; null where one failed. */
  images?: (string | null)[];
  /** The image chosen to carry on from. */
  picked?: number;
  /** Set when the request drew something the redesign does not have. */
  outside?: string;
  failed?: boolean;
}

/** Messages kept per photo; each answer costs money, so a thread ends. */
export const THREAD_LIMIT = 20;
export const COUNTS = [1, 2, 4] as const;
// Nano Banana 2.1 at 2K, from Vertex AI's price list.
const PRICE_PER_IMAGE = 0.05;

/** The image a thread has settled on, if any. */
export function pickedImage(thread: PlantMessage[]): string | null {
  for (const message of [...thread].reverse()) {
    if (message.picked !== undefined) return message.images?.[message.picked] ?? null;
  }
  return null;
}

export const AI_BADGE = "AI illustration · not to scale";

/** The photo as it is and as drawn, with a handle to wipe between them. */
export function Compare({
  before,
  after,
  label,
}: {
  before: string | null;
  after: string | null;
  label: string;
}) {
  const [split, setSplit] = useState(50);
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-ink bg-[#14140f]">
      {before ? (
        <img src={before} alt={`${label} as it is`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-white/60">
          Cutting the view out of your panorama…
        </div>
      )}
      {after && (
        <>
          <img
            src={after}
            alt={`${label} as the AI drew it`}
            className="absolute inset-0 size-full object-cover"
            style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_0_1px_#14140f]"
            style={{ left: `${split}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
            aria-label="Wipe between the photo and the drawing"
            className="absolute inset-0 size-full cursor-ew-resize opacity-0"
          />
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-[#14140f]/80 px-2 py-0.5 text-[11px] font-semibold text-white">
            Now
          </span>
          <span className="pointer-events-none absolute top-2 right-2 rounded-full border border-ink bg-primary px-2 py-0.5 text-[11px] font-semibold text-[#14140f]">
            Redesign
          </span>
        </>
      )}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-[#14140f]/80 px-2 py-0.5 font-mono text-[10px] tracking-wide text-white/90 uppercase">
        {after ? AI_BADGE : "Your photo"}
      </span>
    </div>
  );
}

/**
 * A conversation with Nano Banana about one photo at a time: each answer is
 * a few drawings to choose from, and the chosen one is what the next
 * message changes.
 */
export function ImageChat({
  views,
  active,
  onActive,
  thread,
  images,
  original,
  originalProblem,
  busy,
  pending,
  count,
  onCount,
  onSend,
  onPick,
  resultsPath,
}: {
  views: PlantView[];
  active: PlantView;
  onActive: (id: string) => void;
  thread: PlantMessage[];
  /** Loaded images, as data URLs, by id. */
  images: Record<string, string>;
  original: string | null;
  originalProblem: string;
  busy: boolean;
  /** How many drawings are on their way. */
  pending: number;
  count: number;
  onCount: (count: number) => void;
  onSend: (text: string) => void;
  onPick: (message: string, index: number) => void;
  resultsPath: string;
}) {
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const started = thread.length > 0;
  const full = thread.length >= THREAD_LIMIT;

  // A photo nobody has asked about yet starts with the redesign's request.
  useEffect(() => {
    setDraft(started ? "" : active.prompt);
  }, [active.id, active.prompt, started]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, busy]);

  const picked = pickedImage(thread);
  const after = picked ? (images[picked] ?? null) : null;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || full || !original) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {views.length > 1 && (
        <div role="tablist" aria-label="Photos" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={view.id === active.id}
              onClick={() => onActive(view.id)}
              className={cn(
                "relative shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                view.id === active.id ? "text-[#14140f]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view.id === active.id && (
                <motion.span
                  layoutId="plant-view"
                  transition={springs.snappy}
                  className="absolute inset-0 rounded-full border border-ink bg-primary"
                />
              )}
              <span className="relative">{view.label}</span>
            </button>
          ))}
        </div>
      )}

      <Compare before={original} after={after} label={active.label} />
      {originalProblem && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" /> {originalProblem}
        </p>
      )}
      {after && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Drag across the photo to compare. Every drawing carries Google&apos;s SynthID watermark.</span>
          <a
            href={after}
            download={`${active.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-redesign.jpg`}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-semibold text-foreground outline-none hover:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <DownloadIcon className="size-3.5" /> Download
          </a>
        </div>
      )}

      <ol ref={list} aria-live="polite" className="flex min-h-40 flex-1 flex-col gap-2.5 overflow-y-auto px-0.5">
        {!started && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <ImageIcon className="mr-1.5 inline size-4 align-[-3px]" />
            Nano Banana draws the redesign into this photo. The request below is
            written from your changes: edit it, then send it.
          </li>
        )}
        {thread.map((message) =>
          message.role === "user" ? (
            <li key={message.id} className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-[#14140f]">
              {message.text}
            </li>
          ) : (
            <li
              key={message.id}
              className={cn(
                "flex w-full flex-col gap-2 self-start rounded-2xl rounded-bl-md px-3 py-2.5 text-sm",
                message.failed ? "border border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted",
              )}
            >
              {message.outside && (
                <p className="flex items-start gap-1.5 rounded-xl border border-warning/60 bg-warning/10 px-2.5 py-1.5 text-xs text-foreground">
                  <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
                  <span>
                    <strong>Not in your redesign.</strong> {message.outside}{" "}
                    <Link to={resultsPath} className="underline underline-offset-2">
                      Measure it in Results
                    </Link>{" "}
                    before you plan on it.
                  </span>
                </p>
              )}
              {(message.images?.length ?? 0) > 0 && (
                <div className={cn("grid gap-2", message.images!.length > 1 && "grid-cols-2")}>
                  {message.images!.map((id, index) => {
                    const src = id ? images[id] : undefined;
                    const chosen = message.picked === index;
                    return id ? (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onPick(message.id, index)}
                        aria-pressed={chosen}
                        aria-label={`Use drawing ${index + 1}`}
                        className={cn(
                          "relative aspect-[16/9] overflow-hidden rounded-xl border-2 bg-[#14140f] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                          chosen ? "border-ink shadow-hard-sm" : "border-transparent opacity-80 hover:opacity-100",
                        )}
                      >
                        {src && <img src={src} alt="" className="size-full object-cover" />}
                        {chosen && (
                          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border border-ink bg-primary text-[#14140f]">
                            <CheckIcon className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    ) : (
                      <div key={`failed-${index}`} className="grid aspect-[16/9] place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        No drawing
                      </div>
                    );
                  })}
                </div>
              )}
              {message.text && (
                <span>
                  {message.failed && <CircleAlertIcon className="mr-1.5 inline size-3.5 align-[-2px]" />}
                  {message.text}
                </span>
              )}
            </li>
          ),
        )}
        {busy && (
          <li className="flex w-full flex-col gap-2 self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
            <div className={cn("grid gap-2", pending > 1 && "grid-cols-2")}>
              {Array.from({ length: pending }, (_, index) => (
                <motion.div
                  key={index}
                  className="aspect-[16/9] rounded-xl bg-border"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: motionTokens.duration.slow * 3,
                    repeat: Infinity,
                    delay: index * 0.2,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Drawing… this takes 10 to 30 seconds.
            </span>
          </li>
        )}
      </ol>

      <form
        onSubmit={submit}
        className="flex flex-col gap-1.5 rounded-[22px] border border-ink bg-card p-1.5 pl-3 shadow-hard-sm transition-shadow focus-within:shadow-hard"
      >
        <label htmlFor="plant-chat" className="sr-only">
          Tell Nano Banana what to draw
        </label>
        <textarea
          id="plant-chat"
          rows={2}
          value={draft}
          disabled={full || !original}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            full
              ? "This photo has reached its limit of messages"
              : started
                ? "Change the drawing, e.g. make the new tank grey, or move it to the left wall"
                : "What to draw into this photo"
          }
          className="max-h-40 min-h-12 resize-none bg-transparent py-1.5 pr-1.5 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span id="plant-count-label">Drawings</span>
            <div role="radiogroup" aria-labelledby="plant-count-label" className="flex rounded-full bg-muted p-0.5">
              {COUNTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={count === option}
                  onClick={() => onCount(option)}
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    count === option ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <span title="Nano Banana 2.1 at 2K on Vertex AI">
              ≈ ${(count * PRICE_PER_IMAGE).toFixed(2)}
            </span>
          </div>
          <motion.button
            type="submit"
            aria-label={started ? "Send to Nano Banana" : "Show it in my photo"}
            disabled={!draft.trim() || busy || full || !original}
            whileTap={{ scale: motionTokens.scale.press }}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-ink bg-primary px-3.5 text-[13px] font-semibold text-[#14140f] outline-none transition-opacity hover:shadow-hard-sm focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-40 disabled:hover:shadow-none"
          >
            {started ? (
              <ArrowUpIcon className="size-4" strokeWidth={2.5} />
            ) : (
              <>
                <ImageIcon className="size-4" /> Show it in my photo
              </>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
