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
              const project = createProject(trimmed);
              navigate(`/p/${project.id}/capture`);
            }
          }}
        >
          <div className="grid size-12 place-items-center rounded-2xl border-2 border-ink bg-primary text-[#14140f]">
            {renaming ? <PencilIcon className="size-5" /> : <FolderPlusIcon className="size-5" />}
          </div>
          <DialogTitle>{renaming ? "Rename project" : "New project"}</DialogTitle>
          <DialogDescription>
            {renaming
              ? "Give this project a new name."
              : "Name the plant or line you are twinning. You can change it later."}
          </DialogDescription>
          <div className="grid gap-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              autoFocus
              maxLength={60}
              placeholder="e.g. Pune boiler hall"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {renaming ? "Save" : "Create project"}
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
  const step = STEPS[project.reached] ?? STEPS[0];
  const progress = (project.reached + 1) / STEPS.length;
  return (
    <motion.li
      layout
      variants={riseIn}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: motionTokens.duration.fast } }}
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
            Step {project.reached + 1} of {STEPS.length} · {step.label}
          </span>
          {project.sample && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#14140f] px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-[#f5f5eb] uppercase dark:border dark:border-border">
              <span className="size-1.5 rounded-full bg-primary" />
              Sandbox
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
            <span>Edited {timeAgo(project.updatedAt)}</span>
            <span className="flex items-center gap-1 font-semibold text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              Open <ArrowRightIcon className="size-3.5" />
            </span>
          </div>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Options for ${project.name}`}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent"
        >
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <PencilIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={() => {
              if (window.confirm(`Delete "${project.name}" and everything saved in it?`)) {
                deleteProject(project.id);
              }
            }}
          >
            <Trash2Icon /> Delete
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
      <TopBar logoTo="/workspace" end={<ProfileMenu />} />
      <main className="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: motionTokens.distance.md }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.snappy}
          className="mb-10 flex flex-wrap items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <Avatar seed={profile.avatarSeed} className="size-16 shadow-hard-sm" />
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
                Hey {firstName(profile)} <span className="inline-block origin-[70%_70%] animate-[wave_1.6s_ease-in-out_1]">👋</span>
              </h1>
              <p className="mt-1 text-muted-foreground">
                {projects.length === 0
                  ? "Your workspace is ready. Start your first twin."
                  : `${projects.length} ${projects.length === 1 ? "project" : "projects"} in your workspace.`}
              </p>
            </div>
          </div>
          {projects.length > 0 && (
            <Button onClick={() => setEditing({ mode: "create" })}>
              <PlusIcon /> New project
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
                  {projects.length === 0 ? "Create your first project" : "New project"}
                </span>
                <span className="text-sm text-muted-foreground">
                  One project per plant, hall or line
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
        key={editing ? (editing.mode === "rename" ? editing.project.id : "create") : "closed"}
        editing={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
