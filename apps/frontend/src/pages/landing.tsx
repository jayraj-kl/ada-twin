import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { LogoMark } from "@/components/logo";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { motionTokens, riseIn, springs, stagger } from "@/lib/motion";
import { useProfile } from "@/lib/profile";
import { STEPS } from "@/lib/projects";

function GetStarted({ size = "default" }: { size?: "default" | "lg" | "sm" }) {
  const profile = useProfile();
  return (
    <Button asChild size={size}>
      <Link to={profile ? "/workspace" : "/welcome"}>
        {profile ? "Open your workspace" : "Get started"}
        <ArrowRightIcon />
      </Link>
    </Button>
  );
}

const FLOW = [
  { label: "Intake", tone: "bg-info" },
  { label: "Cutting", tone: "bg-ink" },
  { label: "Buffer", tone: "bg-warning" },
  { label: "Assembly", tone: "bg-ink" },
  { label: "Dispatch", tone: "bg-success" },
];

/** The twin's material flow, drawn as the product draws it. */
function FlowSketch() {
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      variants={stagger(0.12)}
      className="relative rounded-[28px] border-2 border-ink bg-card p-6 shadow-hard sm:p-8"
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Material flow
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-ink bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-[#14140f]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#14140f]" />
          Simulating
        </span>
      </div>
      <div className="flex flex-col items-center">
        {FLOW.map((node, index) => (
          <motion.div
            key={node.label}
            variants={riseIn}
            className="flex flex-col items-center"
          >
            {index > 0 && <span className="h-5 w-px bg-ink/40" />}
            <div className="flex w-52 items-center gap-2.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium">
              <span className={`size-2.5 shrink-0 rounded-full ${node.tone}`} />
              {node.label}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const profile = useProfile();
  return (
    <div className="min-h-svh">
      <TopBar end={<GetStarted size="sm" />} />

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 pt-16 pb-24 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:px-8 lg:pt-24">
        <motion.div initial="hidden" animate="shown" variants={stagger(0.08)}>
          <motion.p
            variants={riseIn}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground"
          >
            <span className="size-2 rounded-full bg-primary ring-1 ring-ink" />
            Digital twins for the factory floor
          </motion.p>
          <motion.h1
            variants={riseIn}
            className="text-5xl leading-[1.02] font-extrabold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl"
          >
            See what breaks on your floor{" "}
            <span className="relative inline-block whitespace-nowrap dark:text-[#14140f]">
              <span className="absolute inset-x-[-0.1em] bottom-[0.06em] -z-10 h-[0.42em] -rotate-1 rounded-md bg-primary dark:top-[0.12em] dark:h-auto" />
              before it does.
            </span>
          </motion.h1>
          <motion.p
            variants={riseIn}
            className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground"
          >
            Turn 360° photos of your plant into a 3D twin, put a crew of AI
            agents on the floor, and run the shift against the conditions you
            are worried about.
          </motion.p>
          <motion.div variants={riseIn} className="mt-9 flex flex-wrap gap-3">
            <GetStarted size="lg" />
            <Button asChild variant="outline" size="lg">
              <a href="#how-it-works">
                How it works <ArrowDownIcon />
              </a>
            </Button>
          </motion.div>
        </motion.div>
        <FlowSketch />
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-20 border-t border-border bg-card/60"
      >
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-sm font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              How it works
            </p>
            <h2 className="text-4xl font-bold tracking-[-0.035em] text-balance sm:text-5xl">
              Seven steps from a photo to a better plant.
            </h2>
          </div>
          <motion.ol
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger(0.06)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {STEPS.map((step, index) => (
              <motion.li
                key={step.slug}
                variants={riseIn}
                whileHover={{ x: -4, y: -4 }}
                transition={springs.snappy}
                className="group rounded-[28px] border-2 border-ink bg-card p-6 transition-shadow duration-200 hover:shadow-hard"
              >
                <span className="mb-10 grid size-10 place-items-center rounded-full border-2 border-ink font-mono text-sm font-semibold transition-colors group-hover:bg-primary group-hover:text-[#14140f]">
                  {index + 1}
                </span>
                <h3 className="text-xl font-bold tracking-tight">
                  {step.label}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.blurb}
                </p>
              </motion.li>
            ))}
            <motion.li
              variants={riseIn}
              className="flex flex-col justify-between rounded-[28px] border-2 border-dashed border-border p-6"
            >
              <p className="text-sm text-muted-foreground">
                Each step saves as you go, so you can come back to any project
                where you left it.
              </p>
              <div className="mt-6">
                <GetStarted size="sm" />
              </div>
            </motion.li>
          </motion.ol>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: motionTokens.distance.lg }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={springs.snappy}
          className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] bg-[#14140f] px-6 py-16 text-center text-[#f5f5eb] sm:px-12 dark:border dark:border-border dark:bg-card"
        >
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/20 blur-3xl" />
          <h2 className="relative mx-auto max-w-2xl text-4xl font-bold tracking-[-0.035em] text-balance sm:text-5xl">
            Your floor, one shift ahead.
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-[#f5f5eb]/70">
            {profile
              ? "Pick up where you left off."
              : "Pick a name, and your workspace is ready in a second."}
          </p>
          <div className="relative mt-8 flex justify-center">
            <GetStarted size="lg" />
          </div>
        </motion.div>
      </section>

      <footer className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <span className="flex items-center gap-2">
          <LogoMark className="size-6 rounded-md" /> AdaTwin
        </span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
