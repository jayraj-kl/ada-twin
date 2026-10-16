import { buttonVariants } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";

// The shared vocabulary of the project steps, as Tailwind classes. Combine
// with cn(), which lets a later class win over an earlier one.
export const ui = {
  eyebrow:
    "inline-flex w-fit items-center rounded-full border border-ink bg-primary px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-[#14140f] uppercase",
  title:
    "mt-3 mb-2 text-3xl leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-4xl",
  lede: "mb-8 max-w-[68ch] text-[15px] text-muted-foreground",

  grid2: "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]",
  grid3: "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]",
  split: "grid grid-cols-1 items-start gap-5 lg:grid-cols-2",
  stack: "flex flex-col gap-4",
  row: "flex flex-wrap items-center gap-3",
  spread: "flex flex-wrap items-baseline justify-between gap-3",
  actions: "mt-8 flex flex-wrap items-center gap-2",

  panel: "rounded-3xl border border-border bg-card p-5",
  panelTitle:
    "mb-3.5 flex items-baseline justify-between gap-2 text-sm font-semibold",
  hint: "text-xs font-normal text-muted-foreground",

  kpi: "rounded-3xl border border-border bg-card px-5 py-4",
  kpiLabel: "text-xs font-medium text-muted-foreground",
  kpiValue: "font-mono text-3xl font-semibold tracking-tight tabular-nums",
  delta: "text-xs",

  good: "text-success",
  poor: "text-destructive",
  fair: "text-warning",

  button: buttonVariants({ variant: "outline", size: "sm" }),
  primary: buttonVariants({ variant: "default", size: "sm" }),

  input: inputClass,
  file: "text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-card file:px-3.5 file:py-1.5 file:text-[13px] file:font-semibold file:text-foreground hover:file:border-ink",
  field: "flex flex-col gap-1.5 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted-foreground",
  fields: "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]",

  tag: "inline-block rounded-full border border-border px-2 py-px text-[11px] font-medium whitespace-nowrap text-muted-foreground",
  tagDoc: "border-current text-success",
  tagAssumed: "border-current text-warning",
  tagUser: "border-current text-info",

  table:
    "w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-2 [&_td]:text-left [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_tr:last-child>td]:border-b-0",
  num: "text-right! font-mono",

  viewerNote: "absolute bottom-2.5 left-3 text-[11px] text-white/75",
  pin: "absolute flex -translate-1/2 items-center gap-1.5 rounded-full bg-[#14140f]/85 py-0.5 pr-2 pl-1 text-xs whitespace-nowrap text-white",
  pinButton:
    "pointer-events-auto cursor-pointer border border-transparent font-[inherit] hover:border-primary",
  pinSelected: "border-primary",

  dot: "inline-block size-2.5 flex-none rounded-full bg-muted-foreground",
  running: "bg-success",
  blocked: "bg-warning",
  down: "bg-destructive",
  idle: "bg-info",
  // Fine itself, but held up by auxiliary equipment that is down.
  stopped:
    "bg-[repeating-linear-gradient(45deg,var(--destructive)_0_2px,var(--card)_2px_4px)] shadow-[inset_0_0_0_1px_var(--destructive)]",

  drop: "grid cursor-pointer place-items-center gap-1 rounded-3xl border-[1.5px] border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-ink [&_strong]:text-foreground",
  dropActive: "border-ink bg-primary/15 text-foreground",
  uploads: "flex list-none flex-col gap-2",
  upload:
    "grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 [&_img]:aspect-[2/1] [&_img]:w-24 [&_img]:rounded-lg [&_img]:bg-muted [&_img]:object-cover",
  uploadName: "truncate",

  problems: "mt-3 list-none space-y-1 text-sm",

  flowCanvas:
    "h-[600px] overflow-hidden rounded-2xl border border-border [&_.react-flow]:bg-background [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-xl [&_.react-flow__controls]:border [&_.react-flow__controls]:border-border [&_.react-flow__controls]:shadow-none",
  flowNode:
    "flex w-[180px] flex-col items-center rounded-md border border-l-4 border-border bg-card px-2.5 py-1.5 text-center text-[13px] text-foreground",
  flowNodeSelected: "outline-2 outline-ink",
  flowKind: "text-[10px] tracking-[0.06em] text-muted-foreground uppercase",
  "flow-source": "border-l-info",
  "flow-station": "border-l-ink",
  "flow-buffer": "border-l-warning",
  "flow-sink": "border-l-success",
  // Auxiliary equipment: off the parts path, so drawn apart from it.
  "flow-support": "border-dashed border-l-solid border-l-muted-foreground",

  feed: "flex max-h-[420px] flex-col gap-2.5 overflow-y-auto",
  feedItem: "border-l-2 border-border pl-2.5",
  feedWho: "font-semibold",
  feedMeta: "text-xs text-muted-foreground",
  quote: "text-muted-foreground",

  timeline: "h-1.5 overflow-hidden rounded-full border border-border bg-muted",
  avatar:
    "grid size-10 flex-none place-items-center rounded-full border-2 border-ink bg-primary font-bold text-[#14140f]",
  bar: "flex h-2.5 min-w-[120px] overflow-hidden rounded-full bg-muted",
  swatch:
    "mb-2.5 grid aspect-[4/3] place-items-center rounded-2xl border border-border bg-[repeating-linear-gradient(45deg,var(--muted)_0_10px,var(--card)_10px_20px)] text-xs text-muted-foreground",
  bubble: "max-w-[85%] rounded-2xl bg-muted px-3 py-2",
  bubbleMine: "self-end bg-primary/25",
} as const;
