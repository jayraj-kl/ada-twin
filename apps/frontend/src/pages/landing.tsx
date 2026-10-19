import { ArrowRightIcon, PlayIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { CopyFloor } from "@/components/landing/copy-floor";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PitchCard, PitchVideo } from "@/components/landing/pitch-video";
import { StackLogos, StackMark } from "@/components/landing/stack-logos";
import { LogoMark } from "@/components/logo";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { motionTokens, riseIn, stagger } from "@/lib/motion";
import { useProfile } from "@/lib/profile";
import { SAMPLES } from "@/twin/sample";

// The page keeps the sizes of the landing-lab v5 study: a frame of 12–20px
// round full-width panels, a gutter of 16–56px inside them, and three
// breakpoints, 1100, 760 and 560px. Only the hero is rounded.

// Pills on a lime panel: ink on lime whatever the theme, since lime is only ever a fill.
const PILL =
  "inline-flex min-h-[50px] items-center gap-2 rounded-full px-[26px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[#14140f]/40 active:translate-y-px";
const INK_PILL = `${PILL} bg-[#14140f] text-[#f5f5eb] hover:bg-[#14140f]/85`;
const LINE_PILL = `${PILL} border-[1.5px] border-[#14140f]/60 text-[#14140f] hover:border-[#14140f] hover:bg-[#14140f]/5`;

/** The primary action and the pitch, as pills on a lime panel. */
function Actions() {
  const profile = useProfile();
  return (
    <div className="flex flex-wrap gap-3">
      <Link to={profile ? "/workspace" : "/welcome"} className={INK_PILL}>
        {profile ? "Open your workspace" : "Start your first twin"}
        <ArrowRightIcon className="size-4" />
      </Link>
      <PitchVideo
        trigger={
          <button type="button" className={LINE_PILL}>
            <PlayIcon className="size-4 fill-current" /> Watch the 60-second pitch
          </button>
        }
      />
    </div>
  );
}

/** Thin ink orbits behind a lime panel, drawn in once. */
function Orbits({
  rings,
  viewBox,
  className,
}: {
  rings: { cx: number; cy: number; rx: number; ry: number; tilt: number }[];
  viewBox: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 -z-10 size-full ${className ?? ""}`}
    >
      {rings.map(({ cx, cy, rx, ry, tilt }, index) => (
        <motion.ellipse
          key={index}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          transform={`rotate(${tilt} ${cx} ${cy})`}
          fill="none"
          stroke="#14140f"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 0.12 * index, ease: motionTokens.easing.smooth }}
        />
      ))}
    </svg>
  );
}

/** The copy-floor figure's read-out, said plainly: "copy · boiler +1" is a second boiler on the copy. */
function copyReading(read: string) {
  const match = /^copy · (.+) \+1$/.exec(read);
  return `On the copy, a second ${match?.[1] ?? "boiler"}. The plant behind is untouched.`;
}

function Hero() {
  const [read, setRead] = useState("rest");
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate grid min-h-[max(600px,min(calc(100svh-2*var(--frame)-92px),900px))] grid-rows-[auto_1fr] overflow-hidden rounded-[clamp(20px,2.4vw,36px)] bg-primary px-(--g) text-[#14140f] max-[760px]:min-h-0 min-[761px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
    >
      <Orbits
        viewBox="0 0 1400 860"
        className="opacity-30"
        rings={[
          { cx: 930, cy: 470, rx: 560, ry: 250, tilt: -14 },
          { cx: 900, cy: 440, rx: 760, ry: 330, tilt: -9 },
          { cx: 980, cy: 500, rx: 380, ry: 170, tilt: -22 },
          { cx: 860, cy: 420, rx: 980, ry: 420, tilt: -6 },
        ]}
      />

      <header className="relative z-10 col-span-full flex items-center gap-7 py-6">
        <Link to="/" className="flex items-center gap-2.5 font-display text-2xl leading-none font-medium tracking-[-0.01em]">
          <LogoMark className="size-8" /> AdaTwin
        </Link>
        <div className="ml-auto grid size-10 place-items-center rounded-full border-[1.5px] border-[#14140f]/40 transition-colors hover:border-[#14140f]">
          <AnimatedThemeToggler className="size-5" />
        </div>
      </header>

      <motion.div
        initial="hidden"
        animate="shown"
        variants={stagger(0.08)}
        className="relative z-10 self-center pt-6 pb-[clamp(40px,7vh,80px)] max-[760px]:pb-7"
      >
        <motion.h1
          id="hero-title"
          variants={riseIn}
          className="mb-7 max-w-[9ch] font-display text-[clamp(3.25rem,9vw,11rem)] leading-[0.93] font-medium tracking-[-0.03em] text-balance max-[560px]:max-w-none max-[560px]:text-[clamp(3.25rem,14vw,4rem)]"
        >
          Redesign before you <em className="tracking-[-0.02em] italic">rebuild</em>.
        </motion.h1>
        <motion.p variants={riseIn} className="mb-7.5 max-w-[44ch] text-lg text-pretty text-[#14140f]/75">
          AdaTwin turns 360° photos of your factory floor into a 3D twin, runs a shift on it with a
          crew of AI agents, and shows which changes would make the plant ship more.
        </motion.p>
        <motion.div variants={riseIn}>
          <Actions />
        </motion.div>
      </motion.div>

      <figure className="relative z-0 w-full max-w-155 self-center justify-self-end pb-[clamp(40px,7vh,80px)] max-[760px]:max-w-none max-[760px]:justify-self-stretch">
        <CopyFloor onRead={setRead} className="hairline-on-lime" />
        <figcaption className="font-mono text-xs text-[#14140f]/70">{copyReading(read)}</figcaption>
      </figure>

      <p
        aria-hidden="true"
        className="absolute right-[calc(var(--g)/2-0.75em)] bottom-8 z-10 rotate-180 font-mono text-xs text-[#14140f]/60 [writing-mode:vertical-rl] max-[560px]:hidden"
      >
        boiler room · boiler-1 → boiler-4 · plant and copy
      </p>
    </section>
  );
}

/** The five sample plants, as a row under the hero. */
function Board() {
  return (
    <section aria-labelledby="board-title" className="px-(--g) pt-2 pb-4.5">
      <h2 id="board-title" className="sr-only">
        Sample plants
      </h2>
      <ol className="grid grid-cols-5 border-t-[1.5px] border-ink max-[1100px]:grid-cols-3 max-[560px]:grid-cols-1">
        {SAMPLES.map((one, index) => (
          <li
            key={one.slug}
            className={`grid gap-0.5 pt-4 pr-4.5 pb-3.5 max-[560px]:border-l-0 max-[560px]:px-0 max-[560px]:py-3 max-[560px]:not-first:border-t ${index === 0 ? "" : "border-l border-ink/20 pl-4.5"} ${index === 3 ? "max-[1100px]:border-l-0 max-[1100px]:pl-0" : ""}`}
          >
            <span className="font-display text-[1.375rem] leading-[1.15] font-medium">{one.title}</span>
            <span className="text-[0.9375rem] text-muted-foreground">{one.unit}</span>
            <span className="font-mono text-xs text-muted-foreground">{one.machines.length} machines</span>
          </li>
        ))}
      </ol>
      <p className="mt-2.5 text-[0.9375rem] text-muted-foreground">Five sample plants open without an upload.</p>
    </section>
  );
}

/** One line of the pitch's result, drawn as a lime trace as long as its share of the best. */
function Trace({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_92px] items-center gap-4.5 border-t border-[#f5f5eb]/25 py-4 last:border-b max-[560px]:grid-cols-[minmax(0,1fr)_84px]">
      <span className="font-medium">{label}</span>
      <span
        aria-hidden="true"
        className="relative h-0.5 bg-primary max-[560px]:col-start-1 max-[560px]:row-start-2"
        style={{ width: `${(value / max) * 100}%` }}
      >
        <span className="absolute -top-0.75 -right-1 size-2 rounded-full bg-primary" />
      </span>
      <span className="text-right font-mono text-xs text-primary max-[560px]:col-start-2 max-[560px]:row-start-1">
        {value} parts
      </span>
    </li>
  );
}

// The boiler room sample's line, in the order its process description gives:
// machines are squares, the queues between them are rings.
const BOILER_LINE = [
  { name: "intake", kind: "end" },
  { name: "staging rack", kind: "queue" },
  { name: "feed pumps", kind: "machine" },
  { name: "header", kind: "queue" },
  { name: "boilers", kind: "machine" },
  { name: "inspection hold", kind: "queue" },
  { name: "control panel", kind: "held" },
  { name: "dispatch", kind: "end" },
] as const;

/** The boiler room's line from intake to dispatch, with the station the pitch found holding it up. */
function BoilerLine() {
  return (
    <figure className="mt-12 border-t border-[#f5f5eb]/25 pt-6 dark:border-border">
      <figcaption className="mb-8 font-display text-[1.375rem] leading-[1.2] font-medium">
        Where the line was held up
      </figcaption>
      <ol className="relative grid grid-cols-8 max-[560px]:grid-cols-1 max-[560px]:gap-4">
        <span
          aria-hidden="true"
          className="absolute top-3.5 right-[6.25%] left-[6.25%] h-px bg-[#f5f5eb]/35 max-[560px]:top-3.5 max-[560px]:bottom-3.5 max-[560px]:left-3.5 max-[560px]:h-auto max-[560px]:w-px"
        />
        {BOILER_LINE.map(({ name, kind }) => (
          <li
            key={name}
            className="relative flex flex-col items-center gap-3 text-center max-[560px]:flex-row max-[560px]:text-left"
          >
            <span className="grid size-7 shrink-0 place-items-center">
              <span
                aria-hidden="true"
                className={
                  kind === "end"
                    ? "h-3.5 w-px bg-[#f5f5eb]/70 max-[560px]:h-px max-[560px]:w-3.5"
                    : kind === "queue"
                      ? "size-3 rounded-full border-[1.5px] border-[#f5f5eb]/70 bg-[#14140f] dark:bg-card"
                      : kind === "machine"
                        ? "size-7 rounded-md border-[1.5px] border-[#f5f5eb] bg-[#14140f] dark:bg-card"
                        : "size-7 rounded-md border-[1.5px] border-primary bg-primary/20 ring-4 ring-primary/20"
                }
              />
            </span>
            <span
              className={`font-mono text-[11px] leading-tight ${kind === "held" ? "text-primary" : "text-[#f5f5eb]/70"}`}
            >
              {name}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-[62ch] text-[0.9375rem] text-[#f5f5eb]/60">
        Squares are machines, rings are the queues between them. In the pitch the crew finds the
        control panel holding up the line.
      </p>
    </figure>
  );
}

function Pitch() {
  return (
    <section
      id="pitch"
      aria-labelledby="pitch-title"
      className="bg-[#14140f] px-(--g) py-[clamp(72px,9vw,130px)] text-[#f5f5eb] dark:bg-card"
    >
      <h2
        id="pitch-title"
        className="max-w-[18ch] font-display text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-medium tracking-[-0.02em] text-balance"
      >
        A heatwave and a rush order, in the boiler room.
      </h2>
      <p className="mt-5.5 max-w-[58ch] text-pretty text-[#f5f5eb]/75">
        In the pitch, the crew finds the control panel holding up the line. The changes that worked
        were tested on a copy of the twin before they were applied.
      </p>

      <div className="mt-[clamp(48px,6vw,88px)] grid items-start gap-[clamp(40px,6vw,96px)] min-[1101px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div>
          <h3 className="mb-4.5 font-display text-[1.375rem] leading-[1.2] font-medium">
            Parts a shift, boiler room sample
          </h3>
          <ol className="mb-5">
            <Trace label="Before the changes" value={198} max={324} />
            <Trace label="With the changes that worked" value={324} max={324} />
          </ol>
          <p className="max-w-[62ch] text-[0.9375rem] text-[#f5f5eb]/60">
            Averaged over ten simulated days, the same days for both.
          </p>
          <BoilerLine />
        </div>
        <PitchCard />
      </div>
    </section>
  );
}

/**
 * Where the samples come from, as a strip on the index's own grid: captures
 * under its first two plants, agents from its third column on.
 */
function Provenance() {
  // Each fact stacks its label, its mark and one sentence, all on the column's
  // left edge, so nothing in it has to share a baseline with a logo.
  const facts = [
    {
      label: "Real captures",
      mark: <StackMark name="World Labs" className="h-7" />,
      text: "Every sample plant is a 360° capture that World Labs Marble turned into a walkable 3D world.",
      cell: "col-span-2 pr-4.5",
    },
    {
      label: "Agents",
      mark: <StackMark name="Gemini" className="h-8" />,
      text: "The crew, a planner, technicians and a supervisor, are Gemini agents running on Vertex AI.",
      cell: "col-span-3 border-l border-ink/20 pl-4.5 max-[1100px]:border-t max-[1100px]:border-l-0 max-[1100px]:pl-0",
    },
  ];
  return (
    <div className="grid grid-cols-5 border-y-[1.5px] border-ink max-[1100px]:grid-cols-1">
      {facts.map(({ label, mark, text, cell }) => (
        <div key={label} className={`grid content-start justify-items-start gap-4 py-6 max-[1100px]:col-span-1 ${cell}`}>
          <span className="rounded-full bg-primary px-3 py-1 font-mono text-[11px] leading-none text-[#14140f]">
            {label}
          </span>
          {mark}
          <p className="max-w-[44ch] text-[0.9375rem] text-pretty text-muted-foreground">{text}</p>
        </div>
      ))}
    </div>
  );
}

/** The same seeded days, and every sample plant's machines by the id the twin gives them. */
function Proof() {
  return (
    <section id="plants" aria-labelledby="plants-title" className="px-(--g) py-[clamp(72px,9vw,130px)]">
      <div className="mb-[clamp(48px,6vw,80px)] grid items-end gap-x-(--g) gap-y-6 min-[761px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <h2
          id="plants-title"
          className="font-display text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-medium tracking-[-0.02em] text-balance"
        >
          The same days, every time.
        </h2>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          The simulation is deterministic for a given seed. Day one replays the run’s seed and each
          further day takes the next, so standard rules, the crew and every change meet exactly the
          same days. Ten days by default, up to sixty.
        </p>
      </div>
      <div className="grid grid-cols-5 border-t-[1.5px] border-ink max-[1100px]:grid-cols-3 max-[560px]:grid-cols-1">
        {SAMPLES.map((one, index) => (
          <div
            key={one.slug}
            className={`pt-4.5 pr-4.5 pb-2 max-[560px]:border-l-0 max-[560px]:px-0 max-[560px]:not-first:border-t ${index === 0 ? "" : "border-l border-ink/20 pl-4.5"} ${index === 3 ? "max-[1100px]:border-l-0 max-[1100px]:pl-0" : ""}`}
          >
            <h3 className="mb-3 font-display text-[1.375rem] leading-[1.15] font-medium">{one.title}</h3>
            <ul>
              {one.machines.map((machine, i) => (
                <li key={machine.name} className="border-t border-ink/15 py-1.5 text-[0.9375rem]">
                  <span className="block font-mono text-xs text-muted-foreground">
                    {one.slug}-{i + 1}
                  </span>
                  {machine.name}
                  {machine.count > 1 && ` ×${machine.count}`}
                  {machine.auxiliary && <span className="text-muted-foreground">, auxiliary</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Provenance />
    </section>
  );
}

function Close() {
  const profile = useProfile();
  return (
    <section
      aria-labelledby="close-title"
      className="relative isolate overflow-hidden bg-primary px-(--g) py-[clamp(80px,10vw,150px)] text-[#14140f]"
    >
      <Orbits
        viewBox="0 0 1400 500"
        className="opacity-25"
        rings={[
          { cx: 700, cy: 380, rx: 820, ry: 260, tilt: -5 },
          { cx: 760, cy: 420, rx: 560, ry: 170, tilt: -9 },
        ]}
      />
      <h2
        id="close-title"
        className="mb-8.5 max-w-[14ch] font-display text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-medium tracking-[-0.02em] text-balance"
      >
        Open a sample plant, or capture your own.
      </h2>
      <p className="mb-7.5 max-w-[44ch] text-lg text-pretty text-[#14140f]/75">
        {profile
          ? "Pick up where you left off."
          : "Pick a name and your workspace is ready. Open the boiler room, foundry, machine shop, pump hall or electrical lab to start."}
      </p>
      <Actions />
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="[--frame:clamp(12px,1.4vw,20px)] [--g:clamp(16px,3.4vw,56px)]">
      <main className="grid gap-(--frame) p-(--frame) text-[1.0625rem] leading-[1.6]">
        <Hero />
        <Board />
        <HowItWorks />
        <Pitch />
        <Proof />
        <Close />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-12 gap-y-8 px-[calc(var(--g)+var(--frame))] pt-6 pb-10 text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <span className="font-mono text-xs">Built on</span>
          <StackLogos />
        </div>
        <span className="flex items-center gap-2 text-sm">
          <LogoMark className="size-6 rounded-md" /> AdaTwin © {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
