import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import {
  type ModelCatalog,
  type ModelChoice,
  type ModelOption,
  confirmModels,
  effectiveModels,
  justConfirmed,
  pickModel,
  useModelCatalog,
  useModelChoice,
} from "@/lib/models";
import { cn } from "@/lib/utils";
import { GeminiLogo } from "./gemini-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Kind = keyof ModelChoice;

const TITLE: Record<Kind, string> = { text: "Text", image: "Images" };

/** "Gemini 3.5 Flash" reads as "3.5 Flash" on the button. */
const short = (label: string) => label.replace(/^Gemini /, "");

/** A pick the API no longer offers would be refused; fall back to its default. */
function useDropStalePicks(catalog: ModelCatalog | null, choice: ModelChoice) {
  useEffect(() => {
    if (!catalog) return;
    for (const kind of ["text", "image"] as const) {
      const id = choice[kind];
      if (id && !catalog[kind].options.some((option) => option.id === id)) {
        pickModel(kind, undefined);
      }
    }
  }, [catalog, choice]);
}

/**
 * Which Gemini models the app uses, for text and for images, in the top bar.
 * The pick lives in this browser and goes with every API request.
 */
export function ModelPicker() {
  const choice = useModelChoice();
  const { catalog, failed, retry } = useModelCatalog();
  useDropStalePicks(catalog, choice);
  // Fresh from the capture step's hint: a soft ring shows where it went.
  const [arrived, setArrived] = useState(justConfirmed);
  useEffect(() => {
    if (!arrived) return;
    const timer = setTimeout(() => setArrived(false), 1600);
    return () => clearTimeout(timer);
  }, [arrived]);
  const using = catalog ? effectiveModels(choice, catalog) : null;

  return (
    <ModelMenu
      kinds={["text", "image"]}
      align="end"
      catalog={catalog}
      failed={failed}
      retry={retry}
      choice={choice}
      trigger={
        <DropdownMenuTrigger
          aria-label={
            using
              ? `AI models: ${using.text.label} for text, ${using.image.label} for images`
              : "AI models"
          }
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent data-[state=open]:text-foreground",
            arrived && "animate-[model-glow_1.4s_ease-in-out_1]",
          )}
        >
          <GeminiLogo className="size-4 shrink-0" />
          {using && (
            <span className="hidden max-w-36 truncate sm:inline">
              {short(using.text.label)}
            </span>
          )}
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
      }
    />
  );
}

/**
 * One quiet line at the start of the capture step: which models will be
 * used, each name a menu to change it. "Got it" hands the picker over to the
 * top bar.
 */
export function ModelHint() {
  const choice = useModelChoice();
  const { catalog, failed, retry } = useModelCatalog();
  useDropStalePicks(catalog, choice);
  const using = catalog ? effectiveModels(choice, catalog) : null;

  const inline = (kind: Kind) => (
    <ModelMenu
      kinds={[kind]}
      align="start"
      catalog={catalog}
      failed={failed}
      retry={retry}
      choice={choice}
      trigger={
        <DropdownMenuTrigger
          aria-label={`${TITLE[kind]} model: ${using?.[kind].label ?? "default"}`}
          className="inline-flex items-center gap-0.5 rounded-md px-1 font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent"
        >
          {using ? using[kind].label : "the default"}
          <ChevronDownIcon className="size-3 opacity-60" />
        </DropdownMenuTrigger>
      }
    />
  );

  return (
    <div
      role="group"
      aria-label="AI models"
      className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground"
    >
      <GeminiLogo className="mr-0.5 size-4 shrink-0" />
      <span>Runs on</span>
      {inline("text")}
      <span>for text and</span>
      {inline("image")}
      <span>for images.</span>
      <button
        type="button"
        onClick={confirmModels}
        title="The models stay in the top bar, to change any time"
        className="ml-1 rounded-md px-1 font-medium text-foreground/70 underline decoration-border underline-offset-4 outline-none transition-colors hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        Got it
      </button>
    </div>
  );
}

const row =
  "group flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] outline-none select-none data-highlighted:bg-accent";

/** The menu both pickers open: one flat group per kind, one line per model. */
function ModelMenu({
  kinds,
  align,
  trigger,
  catalog,
  failed,
  retry,
  choice,
}: {
  kinds: Kind[];
  align: "start" | "end";
  trigger: ReactNode;
  catalog: ModelCatalog | null;
  failed: boolean;
  retry: () => void;
  choice: ModelChoice;
}) {
  // The highlighted row's note, in one footer line, so rows keep one height.
  const [note, setNote] = useState<string | null>(null);
  const picked = kinds.some((kind) => choice[kind]);

  return (
    <DropdownMenu onOpenChange={() => setNote(null)}>
      {trigger}
      <DropdownMenuContent
        align={align}
        className="w-[min(18.5rem,calc(100vw-2rem))] min-w-0 rounded-xl p-1"
      >
        {catalog ? (
          kinds.map((kind, index) => (
            <Group
              key={kind}
              kind={kind}
              catalog={catalog}
              choice={choice}
              first={index === 0}
              onNote={setNote}
            />
          ))
        ) : failed ? (
          <MenuPrimitive.Item
            onSelect={(event) => {
              event.preventDefault();
              retry();
            }}
            className={row}
          >
            <span className="flex-1 text-muted-foreground">
              Cannot reach the API
            </span>
            <span className="text-xs">Retry</span>
          </MenuPrimitive.Item>
        ) : (
          <div className="flex flex-col gap-1 p-1" aria-busy>
            {[0, 1, 2].map((line) => (
              <div
                key={line}
                className="h-6 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        )}

        {catalog && picked && (
          <MenuPrimitive.Item
            onSelect={(event) => {
              event.preventDefault();
              for (const kind of kinds) pickModel(kind, undefined);
            }}
            onFocus={() => setNote(null)}
            className={cn(row, "mt-1 text-muted-foreground")}
          >
            <RotateCcwIcon className="size-3.5" />
            Use the defaults
          </MenuPrimitive.Item>
        )}
        {catalog && (
          <p className="mt-1 min-h-8 border-t border-border px-2 pt-1.5 pb-1 text-[11px] leading-snug text-muted-foreground">
            {note ?? "Used for every AI call from this browser."}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Group({
  kind,
  catalog,
  choice,
  first,
  onNote,
}: {
  kind: Kind;
  catalog: ModelCatalog;
  choice: ModelChoice;
  first: boolean;
  onNote: (note: string) => void;
}) {
  const { default: fallback, options } = catalog[kind];
  const current = effectiveModels(choice, catalog)[kind].id;
  return (
    <MenuPrimitive.Group className={cn(!first && "mt-1")}>
      <MenuPrimitive.Label className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
        {TITLE[kind]}
      </MenuPrimitive.Label>
      <MenuPrimitive.RadioGroup
        value={current}
        onValueChange={(id) =>
          pickModel(kind, id === fallback ? undefined : id)
        }
      >
        {options.map((option) => (
          <Option
            key={option.id}
            option={option}
            isDefault={option.id === fallback}
            onNote={onNote}
            price={
              "pricePerImage" in option
                ? (option.pricePerImage as number)
                : undefined
            }
          />
        ))}
      </MenuPrimitive.RadioGroup>
    </MenuPrimitive.Group>
  );
}

function Option({
  option,
  isDefault,
  price,
  onNote,
}: {
  option: ModelOption;
  isDefault: boolean;
  price?: number;
  onNote: (note: string) => void;
}) {
  const word = isDefault ? "Default" : option.badge;
  return (
    <MenuPrimitive.RadioItem
      value={option.id}
      // Stays open, so both models can be picked in one go.
      onSelect={(event) => event.preventDefault()}
      onFocus={() => onNote(option.note)}
      title={option.id}
      className={cn(row, "data-[state=checked]:font-medium")}
    >
      <span className="min-w-0 truncate">{option.label}</span>
      {word && (
        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
          {word}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {price !== undefined && (
          <span className="font-mono text-[11px] font-normal text-muted-foreground opacity-0 transition-opacity group-data-highlighted:opacity-100">
            ${price.toFixed(3).replace(/0$/, "")}
          </span>
        )}
        <span className="grid w-4 place-items-center">
          <MenuPrimitive.ItemIndicator>
            <CheckIcon className="size-4" />
          </MenuPrimitive.ItemIndicator>
        </span>
      </span>
    </MenuPrimitive.RadioItem>
  );
}
