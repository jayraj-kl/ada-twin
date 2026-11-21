import {
  ArrowRightIcon,
  EllipsisIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Avatar } from "@/components/avatar";
import { ModelPicker } from "@/components/model-picker";
import { ProfileMenu, TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, Label } from "@/components/ui/input";
import { motionTokens, riseIn, springs, stagger } from "@/lib/motion";
import { firstName, useProfile } from "@/lib/profile";
import {
  type Project,
  STEPS,
  createProject,
  deleteProject,
  renameProject,
  timeAgo,
  useProjects,
} from "@/lib/projects";

import { t } from "@/lib/i18n";
type Editing = { mode: "create" } | { mode: "rename"; project: Project } | null;

function NameDialog({
  editing,
  onClose,
}: {
  editing: Editing;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const renaming = editing?.mode === "rename" ? editing.project : null;
  const [name, setName] = useState(renaming?.name ?? "");
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState("");
  const trimmed = name.trim();

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed) return;
            if (renaming) {
              renameProject(renaming.id, trimmed);
              onClose();
            } else {
              setCreating(true);
              setProblem("");
              createProject(trimmed)
                .then((project) => navigate(`/p/${project.id}/capture`))
                .catch((error: unknown) =>
                  setProblem(
                    error instanceof Error ? error.message : String(error),
                  ),
                )
                .finally(() => setCreating(false));
            }
          }}
        >
          <div className="grid size-12 place-items-center rounded-2xl border-2 border-ink bg-primary text-[#14140f]">
            {renaming ? (
              <PencilIcon className="size-5" />
            ) : (
              <FolderPlusIcon className="size-5" />
            )}
          </div>
          <DialogTitle>
            {renaming ? t("Rename project") : t("New project")}
          </DialogTitle>
          <DialogDescription>
            {renaming
              ? t("Give this project a new name.")
              : t(
                  "Name the plant or line you are twinning. You can change it later.",
                )}
          </DialogDescription>
          <div className="grid gap-1.5">
            <Label htmlFor="project-name">{t("Project name")}</Label>
            <Input
              id="project-name"
              autoFocus
              maxLength={60}
              placeholder={t("e.g. Pune boiler hall")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {t("The project could not be created: {0}", { 0: problem })}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!trimmed || creating}>
              {renaming
                ? t("Save")
                : creating
                  ? t("Creating…")
                  : t("Create project")}
              {!renaming && <ArrowRightIcon />}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({
  project,
  onRename,
}: {
  project: Project;
  onRename: () => void;
}) {
  // Projects from before run, report and redesign merged can be past the end.
  const reached = Math.min(project.reached, STEPS.length - 1);
  const step = STEPS[reached]!;
  const progress = (reached + 1) / STEPS.length;
  return (
    <motion.li
      layout
      variants={riseIn}
      exit={{
        opacity: 0,
        scale: 0.95,
        transition: { duration: motionTokens.duration.fast },
      }}
      whileHover={{ x: -4, y: -4 }}
      whileTap={{ scale: 0.99 }}
      transition={springs.snappy}
      className="group relative rounded-[28px] border-2 border-ink bg-card transition-shadow duration-200 hover:shadow-hard"
    >
      <Link
        to={`/p/${project.id}/${step.slug}`}
        className="flex h-full min-h-56 flex-col rounded-[26px] p-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="flex flex-wrap gap-1.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-ink bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-[#14140f]">
            {t("Step {0} of {1} · {2}", {
              0: reached + 1,
              1: STEPS.length,
              2: step.label,
            })}
          </span>
          {project.sample && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#14140f] px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-[#f5f5eb] uppercase dark:border dark:border-border">
              <span className="size-1.5 rounded-full bg-primary" />
              {t("Sandbox")}
            </span>
          )}
        </span>
        <h3 className="mt-5 line-clamp-2 pr-8 text-xl font-bold tracking-tight">
          {project.name}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.blurb}</p>
        <div className="mt-auto pt-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full origin-left rounded-full bg-ink"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress }}
              transition={{ ...springs.gentle, delay: 0.15 }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("Edited {0}", { 0: timeAgo(project.updatedAt) })}</span>
            <span className="flex items-center gap-1 font-semibold text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {t("Open")} <ArrowRightIcon className="size-3.5" />
            </span>
          </div>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("Options for {0}", { 0: project.name })}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent"
        >
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <PencilIcon /> {t("Rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={() => {
              if (
                window.confirm(
                  t('Delete "{0}" and everything saved in it?', {
                    0: project.name,
                  }),
                )
              ) {
                deleteProject(project.id);
              }
            }}
          >
            <Trash2Icon /> {t("Delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.li>
  );
}

export default function WorkspacePage() {
  const profile = useProfile();
  const projects = useProjects();
  const [editing, setEditing] = useState<Editing>(null);

  if (!profile) return <Navigate to="/welcome" replace />;

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="min-h-svh">
      <TopBar
        logoTo="/workspace"
        end={
          <>
            <ModelPicker />
            <ProfileMenu />
          </>
        }
      />
      <main className="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: motionTokens.distance.md }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.snappy}
          className="mb-10 flex flex-wrap items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <Avatar
              seed={profile.avatarSeed}
              className="size-16 shadow-hard-sm"
            />
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
                {t("Hey")} {firstName(profile)}{" "}
                <span className="inline-block origin-[70%_70%] animate-[wave_1.6s_ease-in-out_1]">
                  👋
                </span>
              </h1>
              <p className="mt-1 text-muted-foreground">
                {projects.length === 0
                  ? t("Your workspace is ready. Start your first twin.")
                  : t("{0} {1} in your workspace.", {
                      0: projects.length,
                      1: projects.length === 1 ? t("project") : t("projects"),
                    })}
              </p>
            </div>
          </div>
          {projects.length > 0 && (
            <Button onClick={() => setEditing({ mode: "create" })}>
              <PlusIcon /> {t("New project")}
            </Button>
          )}
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="shown"
          variants={stagger(0.06)}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <motion.li variants={riseIn} layout>
            <button
              type="button"
              onClick={() => setEditing({ mode: "create" })}
              className="group flex h-full min-h-56 w-full flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-dashed border-border p-6 text-center transition-colors outline-none hover:border-ink hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <span className="grid size-14 place-items-center rounded-full border-2 border-ink bg-primary text-[#14140f] transition-transform duration-300 group-hover:rotate-90">
                <PlusIcon className="size-6" />
              </span>
              <span>
                <span className="block text-lg font-bold tracking-tight">
                  {projects.length === 0
                    ? t("Create your first project")
                    : t("New project")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("One project per plant, hall or line")}
                </span>
              </span>
            </button>
          </motion.li>
          <AnimatePresence>
            {sorted.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={() => setEditing({ mode: "rename", project })}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      </main>
      <NameDialog
        key={
          editing
            ? editing.mode === "rename"
              ? editing.project.id
              : "create"
            : "closed"
        }
        editing={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
