import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudAlertIcon,
  CloudCheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useOutlet,
  useParams,
} from "react-router";
import { ModelPicker } from "@/components/model-picker";
import { ProfileMenu, TopBar } from "@/components/top-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModelsConfirmed } from "@/lib/models";
import { motionTokens } from "@/lib/motion";
import { useProfile } from "@/lib/profile";
import {
  loadProject,
  useLoadStatus,
  useSaveStatus,
} from "@/lib/project-store";
import {
  ProjectContext,
  STEPS,
  type StepSlug,
  deleteProject,
  dropProject,
  stepIndex,
  useProjects,
  visitStep,
} from "@/lib/projects";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

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

/** Whether the project's changes have reached the server. */
function SaveIndicator({ projectId }: { projectId: string }) {
  const status = useSaveStatus(projectId);
  const [Icon, label] =
    status === "saving"
      ? [LoaderCircleIcon, "Saving…"]
      : status === "failed"
        ? [CloudAlertIcon, "Couldn't save, retrying"]
        : [CloudCheckIcon, "Saved"];
  return (
    <span
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        status === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn("size-3.5", status === "saving" && "animate-spin")}
        aria-hidden
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

/**
 * The last crumb: the step you are on, which opens a list of all six to go
 * back to any of them, or on to one already reached.
 */
function StepCrumb({
  projectId,
  step,
  reached,
}: {
  projectId: string;
  step: StepSlug;
  reached: number;
}) {
  const current = stepIndex(step);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-current="page"
        aria-label={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]!.label}. Go to another step`}
        className="-mx-1 flex shrink-0 items-center gap-1 rounded-md px-1 font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent"
      >
        {STEPS[current]!.label}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {STEPS.map(({ slug, label, blurb }, index) => {
          const open = index <= Math.max(reached, current);
          return (
            <DropdownMenuItem
              key={slug}
              asChild={open}
              disabled={!open}
              title={open ? blurb : "Not reached yet"}
              className="data-disabled:cursor-default data-disabled:opacity-50"
            >
              {open ? (
                <Link to={`/p/${projectId}/${slug}`}>
                  <StepRow index={index} label={label} here={index === current} />
                </Link>
              ) : (
                <StepRow index={index} label={label} here={false} />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepRow({
  index,
  label,
  here,
}: {
  index: number;
  label: string;
  here: boolean;
}) {
  return (
    <>
      <span className="w-4 font-mono text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <span className={cn("flex-1", here && "font-medium")}>{label}</span>
      {here && <CheckIcon />}
    </>
  );
}

export default function ProjectLayout() {
  const { projectId = "" } = useParams();
  const { pathname, state } = useLocation();
  const profile = useProfile();
  const project = useProjects().find(({ id }) => id === projectId);
  const load = useLoadStatus(projectId);
  const step = currentStep(pathname);
  const immersive = IMMERSIVE.includes(step);
  // The capture step asks about the models first; until then the top bar
  // leaves the picker to it.
  const modelsConfirmed = useModelsConfirmed();
  const showPicker = modelsConfirmed || step !== "capture";
  // A snapshot, so the page fading out keeps showing what it showed.
  const outlet = useOutlet();

  // The project is loaded before any step shows, so its values are ready.
  useEffect(() => {
    if (projectId) void loadProject(projectId);
  }, [projectId]);
  useEffect(() => {
    if (load === "missing") dropProject(projectId);
  }, [load, projectId]);

  useEffect(() => {
    if (project && load === "ready") visitStep(project.id, step);
  }, [project, load, step]);

  // Set by "Delete sample", which leaves for here first.
  const discard = (state as { discard?: string } | null)?.discard;
  useEffect(() => {
    if (discard && discard !== projectId) deleteProject(discard);
  }, [discard, projectId]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (!profile) return <Navigate to="/welcome" replace />;
  if (load === "missing" || load === "failed") {
    return (
      <div className="mx-auto grid min-h-svh max-w-md place-content-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">
          {load === "missing"
            ? "This project doesn't exist or was deleted"
            : "This project couldn't be loaded"}
        </h1>
        <p className={ui.hint}>
          {load === "missing"
            ? "It may have been deleted on another device, or the link is wrong."
            : "The server didn't answer. Check that the API is running, then try again."}
        </p>
        <div className="flex justify-center gap-2">
          {load === "failed" && (
            <button
              type="button"
              className={cn(ui.button, ui.primary)}
              onClick={() => void loadProject(projectId)}
            >
              Try again
            </button>
          )}
          <Link to="/workspace" className={ui.button}>
            Back to the workspace
          </Link>
        </div>
      </div>
    );
  }
  if (load !== "ready" || !project) return <StepFallback />;

  return (
    <ProjectContext.Provider value={project.id}>
      <div className={immersive ? "flex h-svh flex-col" : "min-h-svh"}>
        <TopBar
          logoTo="/workspace"
          wide
          compact
          end={
            <>
              <SaveIndicator projectId={project.id} />
              {showPicker && <ModelPicker />}
              <ProfileMenu />
            </>
          }
        >
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
            <span className="min-w-0 truncate text-muted-foreground">
              {project.name}
            </span>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <StepCrumb
              projectId={project.id}
              step={step}
              reached={project.reached}
            />
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
            className="h-1 bg-primary print:hidden"
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
              <Suspense fallback={<StepFallback />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ProjectContext.Provider>
  );
}
