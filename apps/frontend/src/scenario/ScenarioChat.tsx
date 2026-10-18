import {
  ArrowUpIcon,
  CheckIcon,
  CircleAlertIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { motionTokens } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ScenarioAnswer } from "@/twin/api";
import { FIELD_LABELS } from "./fields";

export interface ScenarioChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** What the answer proposes, each change with the value it replaces. */
  proposal?: Omit<ScenarioAnswer, "reply" | "changes"> & {
    changes: (ScenarioAnswer["changes"][number] & {
      from?: number | string;
    })[];
  };
  decided?: "accepted" | "dismissed";
  /** The request failed; not sent back to the model as conversation. */
  failed?: boolean;
}

// Shown when the AI's suggestions are not to be had.
const EXAMPLES = [
  "A heatwave week with a rush order and half the maintenance crew off sick",
  "A quiet shift with half the usual demand",
];

/**
 * A conversation that sets up the scenario from a description in words: it
 * proposes settings and a crew briefing, and nothing changes until accepted.
 */
export function ScenarioChat({
  messages,
  unit,
  suggestions,
  busy,
  onSend,
  onAccept,
  onDismiss,
  onClear,
}: {
  messages: ScenarioChatMessage[];
  /** What the plant makes, as values are counted. */
  unit: string;
  /** Written by the AI for this plant; null while being written. */
  suggestions?: string[] | null;
  busy: boolean;
  onSend: (text: string) => void;
  onAccept: (message: string) => void;
  onDismiss: (message: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const thread = useRef<HTMLOListElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({
      top: thread.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, busy]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <SparklesIcon className="size-4" /> Describe it in words
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">
            {suggestions === null
              ? "Gemini is suggesting scenarios for this plant…"
              : suggestions?.length
                ? "Suggested by Gemini for this plant"
                : "For example"}
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            aria-busy={suggestions === null}
          >
            {suggestions === null
              ? [176, 232, 200].map((width) => (
                  <span
                    key={width}
                    style={{ width }}
                    className="h-[26px] animate-pulse rounded-full bg-muted"
                  />
                ))
              : (suggestions?.length ? suggestions : EXAMPLES).map(
                  (example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setDraft(example)}
                      className="rounded-full border border-border bg-card px-3 py-1 text-left text-xs text-muted-foreground outline-none hover:border-ink hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      {example}
                    </button>
                  ),
                )}
          </div>
        </div>
      ) : (
        <ol
          ref={thread}
          aria-live="polite"
          className="flex max-h-[360px] flex-col gap-2.5 overflow-y-auto pb-1"
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
              {message.proposal && (
                <Proposal
                  message={message}
                  unit={unit}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
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
        </ol>
      )}

      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-[22px] border border-ink bg-card p-1.5 pl-3 shadow-hard-sm transition-shadow focus-within:shadow-hard"
      >
        <label htmlFor="scenario-chat" className="sr-only">
          Describe the scenario in words
        </label>
        <textarea
          id="scenario-chat"
          rows={1}
          value={draft}
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
          placeholder="What is this shift up against?"
          className="max-h-32 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-sm outline-none field-sizing-content placeholder:text-muted-foreground/80"
        />
        <motion.button
          type="submit"
          aria-label="Send to the AI"
          disabled={!draft.trim() || busy}
          whileTap={{ scale: motionTokens.scale.press }}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-ink bg-primary text-[#14140f] outline-none transition-opacity hover:shadow-hard-sm focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-40 disabled:hover:shadow-none"
        >
          <ArrowUpIcon className="size-4" strokeWidth={2.5} />
        </motion.button>
      </form>
    </div>
  );
}

function Proposal({
  message,
  unit,
  onAccept,
  onDismiss,
}: {
  message: ScenarioChatMessage;
  unit: string;
  onAccept: (message: string) => void;
  onDismiss: (message: string) => void;
}) {
  const { changes, briefing, notModelled } = message.proposal!;
  const show = (field: keyof typeof FIELD_LABELS, value?: number | string | null) =>
    value === undefined || value === null
      ? "not set"
      : FIELD_LABELS[field].show(value, unit);
  const proposesSomething = changes.length > 0 || briefing !== null;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card px-3 py-2 text-foreground",
        message.decided === "accepted" ? "border-ink" : "border-border",
        message.decided === "dismissed" && "opacity-55",
      )}
    >
      {changes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {changes.map((change) => (
            <li key={change.field} className="text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <strong className="text-[13px]">
                  {FIELD_LABELS[change.field].label}
                </strong>
                <span className="font-mono">
                  <span className="text-muted-foreground line-through">
                    {show(change.field, change.from)}
                  </span>{" "}
                  → {show(change.field, change.value)}
                </span>
              </div>
              {change.reason && (
                <p className="text-muted-foreground">{change.reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {briefing !== null && (
        <div className="text-xs">
          <strong className="text-[13px]">Crew briefing</strong>
          <p className="text-muted-foreground">{briefing}</p>
        </div>
      )}
      {notModelled.length > 0 && (
        <div className="text-xs">
          <strong className="text-[13px] text-warning">Not modelled yet</strong>
          <ul className="list-disc pl-4 text-muted-foreground">
            {notModelled.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {proposesSomething && (
        <div className="flex items-center gap-1.5">
          {message.decided ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              {message.decided === "accepted" ? (
                <>
                  <CheckIcon className="size-3.5 text-success" /> Applied to
                  the scenario
                </>
              ) : (
                "Dismissed"
              )}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onAccept(message.id)}
                className="flex items-center gap-1 rounded-full border border-ink bg-primary px-2.5 py-0.5 text-xs font-semibold text-[#14140f] outline-none hover:shadow-hard-sm focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <CheckIcon className="size-3" /> Accept
              </button>
              <button
                type="button"
                onClick={() => onDismiss(message.id)}
                className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground outline-none hover:border-ink hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <XIcon className="size-3" /> Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
