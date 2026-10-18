import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Flow } from "./flow";

export interface FlowChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** What the answer changed, e.g. "+1 buffer", for a quick read. */
  changes?: string[];
  /** The flow before this answer was applied, to undo it. */
  before?: Flow;
  undone?: boolean;
  /** The request failed; not sent back to the model as conversation. */
  failed?: boolean;
}

/**
 * A conversation with the AI about the material flow: say how parts really
 * move and it edits the diagram, alongside dragging links by hand.
 */
export function FlowChat({
  messages,
  busy,
  disabled,
  problems,
  onSend,
  onUndo,
  onClear,
}: {
  messages: FlowChatMessage[];
  busy: boolean;
  /** Why nothing can be asked yet, if so. */
  disabled?: string;
  problems: string[];
  onSend: (text: string) => void;
  onUndo: (id: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(messages.length > 0);
  const thread = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

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

  // Unresolved problems, turned into requests the user can send as they are.
  const suggestions =
    messages.length === 0
      ? problems.slice(0, 2).map((problem) => `Fix this: ${problem}`)
      : [];
  const lastChange = [...messages]
    .reverse()
    .find((message) => message.before && !message.undone);

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2">
      <AnimatePresence initial={false}>
        {open && messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: motionTokens.distance.sm }}
            transition={springs.snappy}
            className="rounded-3xl border border-border bg-card/95 shadow-[0_12px_40px_rgb(0_0_0/0.12)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <SparklesIcon className="size-3.5" /> Flow assistant
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-full px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Hide the conversation"
                  className="grid size-6 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <ChevronDownIcon className="size-4" />
                </button>
              </span>
            </div>
            <ol
              ref={thread}
              aria-live="polite"
              className="flex max-h-[min(40vh,320px)] flex-col gap-2.5 overflow-y-auto px-3 py-3"
            >
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    "flex max-w-[88%] flex-col gap-1.5 rounded-2xl px-3.5 py-2 text-sm",
                    message.role === "user"
                      ? "self-end rounded-br-md bg-primary text-[#14140f]"
                      : message.failed
                        ? "self-start rounded-bl-md border border-destructive/40 bg-destructive/5 text-destructive"
                        : "self-start rounded-bl-md bg-muted",
                  )}
                >
                  <span
                    className={cn(message.undone && "line-through opacity-60")}
                  >
                    {message.failed && (
                      <CircleAlertIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                    )}
                    {message.text}
                  </span>
                  {(message.changes?.length ?? 0) > 0 && (
                    <span className="flex flex-wrap items-center gap-1">
                      {message.changes!.map((change) => (
                        <span
                          key={change}
                          className="rounded-full border border-border bg-card px-2 py-px font-mono text-[11px] text-muted-foreground"
                        >
                          {change}
                        </span>
                      ))}
                      {message === lastChange && (
                        <button
                          type="button"
                          onClick={() => onUndo(message.id)}
                          className="ml-1 flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold text-foreground outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        >
                          <Undo2Icon className="size-3" /> Undo
                        </button>
                      )}
                      {message.undone && (
                        <span className="text-[11px] text-muted-foreground">
                          Undone
                        </span>
                      )}
                    </span>
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
                        duration: 1,
                        repeat: Infinity,
                        delay: dot * 0.15,
                      }}
                    />
                  ))}
                  <span className="sr-only">Working on it</span>
                </li>
              )}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      {suggestions.length > 0 && !disabled && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setDraft(suggestion);
                input.current?.focus();
              }}
              className="max-w-full truncate rounded-full border border-border bg-card/90 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md outline-none hover:border-ink hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-[24px] border border-ink bg-card p-1.5 pl-2 shadow-hard-sm transition-shadow focus-within:shadow-hard"
      >
        <button
          type="button"
          onClick={() => messages.length > 0 && setOpen((value) => !value)}
          aria-label={
            problems.length === 0
              ? "The flow can be simulated"
              : `${problems.length} problems to fix`
          }
          title={
            problems.length === 0
              ? "This flow can be simulated"
              : problems.join("\n")
          }
          className={cn(
            "mb-0.5 flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 font-mono text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            problems.length === 0
              ? "bg-success/15 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {problems.length === 0 ? (
            <CheckIcon className="size-3.5" strokeWidth={3} />
          ) : (
            <CircleAlertIcon className="size-3.5" />
          )}
          {problems.length === 0 ? "Ready" : problems.length}
        </button>
        <label htmlFor="flow-chat" className="sr-only">
          Tell the AI how material moves through your floor
        </label>
        <textarea
          id="flow-chat"
          ref={input}
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
          placeholder={
            disabled ??
            "Describe your flow, e.g. after cutting, pieces wait on a rack for 12, then go to welding"
          }
          className="max-h-32 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
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
