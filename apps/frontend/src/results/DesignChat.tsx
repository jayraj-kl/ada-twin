import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Change, MeasuredChange } from "@/twin/recommend";
import { signed } from "./format";

export interface DesignChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Changes the answer proposes, waiting to be kept or dropped. */
  proposed?: Change[];
  decided?: Record<string, "kept" | "dropped">;
  /** The request failed; not sent back to the model as conversation. */
  failed?: boolean;
}

/**
 * A conversation with the AI about the redesign: say what you would change
 * and it proposes changes, each measured before you keep it.
 */
export function DesignChat({
  messages,
  busy,
  disabled,
  suggestions,
  previews,
  compact = false,
  onSend,
  onKeep,
  onDrop,
  onSuggest,
  onClear,
}: {
  messages: DesignChatMessage[];
  busy: boolean;
  /** Why nothing can be asked yet, if so. */
  disabled?: string;
  /** The report's own suggestions not in the redesign yet, best first. */
  suggestions: MeasuredChange[];
  /** Parts per shift each proposed change adds to the redesign, once measured. */
  previews: Record<string, number | "failed">;
  /** Only the input, for a lowered bottom sheet. */
  compact?: boolean;
  onSend: (text: string) => void;
  onKeep: (message: string, changes: Change[]) => void;
  onDrop: (message: string, change: string) => void;
  onSuggest: (change: MeasuredChange) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);
  const thread = useRef<HTMLOListElement>(null);

  // A new message opens the thread and scrolls it to the end.
  useEffect(() => {
    if (messages.length === 0) return;
    setOpen(true);
    thread.current?.scrollTo({
      top: thread.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, busy]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {messages.length > 0 && !compact && (
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex items-center gap-1.5 rounded-full px-1 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <SparklesIcon className="size-3.5" /> Design assistant
            {open ? (
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronUpIcon className="size-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            Clear
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && messages.length > 0 && !compact && (
          <motion.ol
            ref={thread}
            aria-live="polite"
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: motionTokens.distance.sm }}
            transition={springs.snappy}
            className="flex max-h-[min(26svh,240px)] min-h-0 flex-col gap-2.5 overflow-y-auto px-1 pb-1"
          >
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl px-3.5 py-2 text-sm",
                  message.role === "user"
                    ? "max-w-[88%] self-end rounded-br-md bg-primary text-[#14140f]"
                    : message.failed
                      ? "max-w-[92%] self-start rounded-bl-md border border-destructive/40 bg-destructive/5 text-destructive"
                      : "w-full max-w-[96%] self-start rounded-bl-md bg-muted",
                )}
              >
                <span>
                  {message.failed && (
                    <CircleAlertIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                  )}
                  {message.text}
                </span>
                {(message.proposed?.length ?? 0) > 0 && (
                  <Proposals
                    message={message}
                    previews={previews}
                    onKeep={onKeep}
                    onDrop={onDrop}
                  />
                )}
              </li>
            ))}
            {busy && (
              <li className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-muted px-3.5 py-3">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-1.5 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: motionTokens.duration.slow * 2,
                      repeat: Infinity,
                      delay: dot * 0.15,
                    }}
                  />
                ))}
                <span className="sr-only">Working on it</span>
              </li>
            )}
          </motion.ol>
        )}
      </AnimatePresence>

      {suggestions.length > 0 && !disabled && !compact && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
          {suggestions.slice(0, 4).map((change) => (
            <button
              key={change.id}
              type="button"
              onClick={() => onSuggest(change)}
              title={change.detail}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground outline-none hover:border-ink hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <PlusIcon className="size-3" />
              {change.title}
              <span
                className={cn(
                  "font-mono font-semibold",
                  change.gain > 0 ? "text-success" : "text-muted-foreground",
                )}
              >
                {signed(change.gain)}
              </span>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-[22px] border border-ink bg-card p-1.5 pl-3 shadow-hard-sm transition-shadow focus-within:shadow-hard"
      >
        <label htmlFor="design-chat" className="sr-only">
          Tell the AI what you would change in the plant
        </label>
        <textarea
          id="design-chat"
          rows={1}
          value={draft}
          disabled={Boolean(disabled)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ?? "What would you change?"}
          className="max-h-32 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-sm outline-none field-sizing-content placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
        />
        <motion.button
          type="submit"
          aria-label="Send to the AI"
          disabled={!draft.trim() || busy || Boolean(disabled)}
          whileTap={{ scale: motionTokens.scale.press }}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-ink bg-primary text-[#14140f] outline-none transition-opacity hover:shadow-hard-sm focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-40 disabled:hover:shadow-none"
        >
          <ArrowUpIcon className="size-4" strokeWidth={2.5} />
        </motion.button>
      </form>
    </div>
  );
}

function Proposals({
  message,
  previews,
  onKeep,
  onDrop,
}: {
  message: DesignChatMessage;
  previews: Record<string, number | "failed">;
  onKeep: (message: string, changes: Change[]) => void;
  onDrop: (message: string, change: string) => void;
}) {
  const proposed = message.proposed ?? [];
  const pending = proposed.filter(({ id }) => !message.decided?.[id]);
  return (
    <div className="flex flex-col gap-1.5">
      {proposed.map((change) => {
        const decided = message.decided?.[change.id];
        const preview = previews[change.id];
        return (
          <div
            key={change.id}
            className={cn(
              "rounded-xl border bg-card px-3 py-2 text-foreground",
              decided === "kept" ? "border-ink" : "border-border",
              decided === "dropped" && "opacity-55",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <strong
                className={cn(
                  "text-[13px] leading-snug",
                  decided === "dropped" && "line-through",
                )}
              >
                {change.title}
              </strong>
              <span
                className={cn(
                  "shrink-0 font-mono text-xs font-semibold",
                  preview === "failed"
                    ? "text-destructive"
                    : typeof preview === "number" && preview > 0
                      ? "text-success"
                      : "text-muted-foreground",
                )}
                title="Parts per shift it adds to the redesign, on standard rules"
              >
                {preview === undefined
                  ? "…"
                  : preview === "failed"
                    ? "does not fit"
                    : `${signed(preview)}/shift`}
              </span>
            </div>
            {change.detail && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {change.detail}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              {decided ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  {decided === "kept" ? (
                    <>
                      <CheckIcon className="size-3.5 text-success" /> In the
                      redesign
                    </>
                  ) : (
                    "Dropped"
                  )}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={preview === "failed"}
                    onClick={() => onKeep(message.id, [change])}
                    className="flex items-center gap-1 rounded-full border border-ink bg-primary px-2.5 py-0.5 text-xs font-semibold text-[#14140f] outline-none hover:shadow-hard-sm focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-40 disabled:hover:shadow-none"
                  >
                    <CheckIcon className="size-3" /> Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => onDrop(message.id, change.id)}
                    className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground outline-none hover:border-ink hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <XIcon className="size-3" /> Drop
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {pending.length > 1 && (
        <button
          type="button"
          onClick={() =>
            onKeep(
              message.id,
              pending.filter(({ id }) => previews[id] !== "failed"),
            )
          }
          className="self-start rounded-full px-2 py-0.5 text-xs font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          Keep all {pending.length}
        </button>
      )}
    </div>
  );
}
