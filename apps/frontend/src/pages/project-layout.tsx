import { ChevronRightIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect } from "react";
import { Link, Navigate, useLocation, useOutlet, useParams } from "react-router";
import { ProfileMenu, TopBar } from "@/components/top-bar";
import { motionTokens } from "@/lib/motion";
import { useProfile } from "@/lib/profile";
import {
  ProjectContext,
  STEPS,
  type StepSlug,
  deleteProject,
  useProjects,
  visitStep,
} from "@/lib/projects";

// Steps whose page is the world itself, filling everything under the top bar.
const IMMERSIVE: readonly StepSlug[] = ["twin", "results"];

function currentStep(pathname: string): StepSlug {
  const last = pathname.split("/").filter(Boolean).at(-1);
  return STEPS.find((step) => step.slug === last)?.slug ?? "capture";
}

export function StepFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loading-slide_1s_ease-in-out_infinite] rounded-full bg-ink" />
      </div>
    </div>
  );
}

export default function ProjectLayout() {
  const { projectId = "" } = useParams();
  const { pathname, state } = useLocation();
  const profile = useProfile();
  const project = useProjects().find(({ id }) => id === projectId);
  const step = currentStep(pathname);
  const immersive = IMMERSIVE.includes(step);
  // A snapshot, so the page fading out keeps showing what it showed.
  const outlet = useOutlet();

  useEffect(() => {
    if (project) visitStep(project.id, step);
  }, [project, step]);

  // Set by "Delete sample", which leaves for here first.
  const discard = (state as { discard?: string } | null)?.discard;
  useEffect(() => {
    if (discard && discard !== projectId) deleteProject(discard);
  }, [discard, projectId]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (!profile) return <Navigate to="/welcome" replace />;
  if (!project) return <Navigate to="/workspace" replace />;

  return (
    <ProjectContext.Provider value={project.id}>
      <div className={immersive ? "flex h-svh flex-col" : "min-h-svh"}>
        <TopBar logoTo="/workspace" wide compact end={<ProfileMenu />}>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-sm"
          >
            <Link
              to="/workspace"
              className="hidden shrink-0 text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Workspace
            </Link>
            <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
            <span className="truncate font-semibold">{project.name}</span>
            {project.sample && (
              <span
                title="A sample plant, not your data"
                className="ml-2 flex shrink-0 items-center gap-1.5 rounded-full bg-[#14140f] px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-[#f5f5eb] uppercase dark:border dark:border-border"
              >
                <span className="size-1.5 rounded-full bg-primary" />
                Sandbox
              </span>
            )}
          </nav>
        </TopBar>
        {project.sample && (
          <div
            aria-hidden
            className="h-1.5 bg-[repeating-linear-gradient(135deg,var(--primary)_0_8px,transparent_8px_16px)]"
          />
        )}
        <main
          className={
            immersive
              ? "relative min-h-0 flex-1 overflow-hidden"
              : "mx-auto max-w-[1440px] px-4 pt-8 pb-20 sm:px-6"
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: motionTokens.distance.sm }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -motionTokens.distance.sm }}
              transition={{
                duration: motionTokens.duration.fast,
                ease: motionTokens.easing.smooth,
              }}
              className={immersive ? "h-full" : undefined}
            >
              <Suspense fallback={<StepFallback />}>
                {outlet}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ProjectContext.Provider>
  );
}
