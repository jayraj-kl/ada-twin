import {
  ArrowRightIcon,
  ImageUpIcon,
  LogOutIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ClipboardEvent,
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ModelHint } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { useModelsConfirmed } from "@/lib/models";
import { motionTokens, springs } from "@/lib/motion";
import {
  deleteProject,
  getProject,
  openSampleProject,
  useProjectId,
  useProjectPath,
  useProjects,
} from "@/lib/projects";
import {
  getField,
  loadProject,
  setField,
  setState,
  useStateValue,
} from "@/lib/project-store";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  deleteDocument,
  documentUrl,
  listDocuments,
  renameDocument,
  uploadDocument,
} from "@/twin/api";
import { REDESIGN_PANORAMA } from "@/plant/RedesignWorld";
import { PROCESS_KEY } from "@/twin/flow";
import { useStored } from "@/twin/project";
import { startWorld, useProjectWorld } from "@/twin/world";
import {
  SAMPLES,
  SAMPLE_CREDIT,
  SAMPLE_WORLD_KEY,
  type Sample,
  sampleMachines,
  sampleOf,
  sampleSeed,
} from "@/twin/sample";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;
const TYPE_MS = 1100;

interface Upload {
  id: string;
  name: string;
  preview: string;
  /** Pixel size, when the image could be read. */
  pixels?: string;
  megabytes: string;
  /** The room or hall it shows, as the user names it. */
  room: string;
  /** Why this file cannot be used as a panorama, if it cannot. */
  problem?: string;
  /** Its id once kept with the project; usable panoramas upload on adding. */
  documentId?: string;
  /** The upload under way, until the panorama is kept. */
  saving?: boolean;
}

// A room name is saved this long after the last keystroke.
const RENAME_DELAY_MS = 700;

async function readUpload(file: File): Promise<Upload> {
  const preview = URL.createObjectURL(file);
  const base = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    preview,
    megabytes: `${(file.size / 1e6).toFixed(1)} MB`,
    room: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
  };
  try {
    const image = new Image();
    image.src = preview;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    return {
      ...base,
      pixels: `${width}×${height}`,
      problem:
        file.size > MAX_BYTES
          ? "Larger than 20 MB"
          : Math.abs(width / height - 2) > 0.02
            ? "Not a 2:1 panorama"
            : undefined,
    };
  } catch {
    return { ...base, problem: "Could not read this image" };
  }
}

/** True while files are dragged anywhere over the window. */
function useWindowDrag(enabled: boolean, onFiles: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    // Enter and leave fire for every child crossed, so count the depth.
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (event.dataTransfer) latest.current(event.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);

  return dragging;
}

/** Writes `text` out over about TYPE_MS; any key or click finishes it. */
function useTypewriter(text: string, active: boolean) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(active && !reduce ? 0 : text.length);

  useEffect(() => {
    if (!active || reduce) return;
    let frame = 0;
    const start = performance.now();
    const finish = () => setShown(text.length);
    const tick = (now: number) => {
      const next = Math.ceil(((now - start) / TYPE_MS) * text.length);
      setShown(Math.min(next, text.length));
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("keydown", finish, { once: true });
    window.addEventListener("pointerdown", finish, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [active, reduce, text]);

  return { text: text.slice(0, shown), done: shown >= text.length };
}

/** A 2:1 panorama that pans round while hovered or focused. */
function PanoTile({
  src,
  meta,
  problem,
  sample,
  room,
  onRoom,
  onRemove,
}: {
  src: string;
  meta: string;
  problem?: string;
  sample?: boolean;
  room: string;
  onRoom?: (room: string) => void;
  onRemove?: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: motionTokens.scale.press }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: motionTokens.scale.press }}
      transition={springs.snappy}
      className="group flex min-w-0 flex-col gap-1.5"
    >
      <div
        className="relative aspect-[2/1] overflow-hidden rounded-2xl border border-border bg-muted [container-type:inline-size] group-focus-within:border-ink group-hover:border-ink"
        role="img"
        aria-label={`${room || "Untitled room"}, 360° panorama`}
      >
        <div
          className="pano-pan absolute inset-0 group-focus-within:[animation-play-state:running] group-hover:[animation-play-state:running]"
          style={{ backgroundImage: `url("${src}")` } as CSSProperties}
        />
        {problem && (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--destructive)_30%,transparent)_0_6px,transparent_6px_12px)]" />
        )}
        {sample && (
          <span className="absolute top-1.5 left-1.5 rounded-full border border-ink bg-primary px-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[#14140f] uppercase">
            Sample
          </span>
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#14140f]/80 px-1.5 font-mono text-[10px] text-white tabular-nums">
          360° · {meta}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${room || "this panorama"}`}
            className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full border border-ink bg-card text-foreground outline-none hover:shadow-hard-sm focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      {onRoom ? (
        <input
          value={room}
          onChange={(event) => onRoom(event.target.value)}
          aria-label="Room or hall shown"
          placeholder="Name this room"
          maxLength={40}
          className="w-full truncate rounded-md bg-transparent px-1 text-xs font-medium outline-none placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
      ) : (
        <span className="truncate px-1 text-xs font-medium">{room}</span>
      )}
      {problem && (
        <span className="px-1 text-xs text-destructive">{problem}</span>
      )}
    </motion.li>
  );
}

/** The sample plants, one card each, for trying the app without photos. */
function SampleWorlds({ onOpen }: { onOpen: (sample: Sample) => void }) {
  return (
    <section aria-labelledby="samples-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="samples-title" className="font-bold tracking-tight">
          Sample worlds
        </h2>
        <p className="text-sm text-muted-foreground">
          Building a 3D world from your own panorama can take a while. To try
          the app out now, open one of these real plants below. Each opens as a
          separate sample project. {SAMPLE_CREDIT}.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLES.map((one, index) => (
          <motion.li
            key={one.slug}
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.snappy, delay: index * 0.04 }}
            className="group/sample flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-card p-3 transition-[border-color,box-shadow,translate] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink hover:shadow-hard-sm"
          >
            <div className="relative aspect-[2/1] overflow-hidden rounded-2xl border border-border bg-muted [container-type:inline-size]">
              <div
                className="pano-pan absolute inset-0 group-focus-within/sample:[animation-play-state:running] group-hover/sample:[animation-play-state:running]"
                style={{ backgroundImage: `url("${one.pano}")` }}
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#14140f]/80 px-1.5 font-mono text-[10px] text-white">
                360° · 3D world
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1 px-1">
              <h3 className="font-semibold tracking-tight">{one.title}</h3>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {one.process}
              </p>
              <ul
                aria-label={`Machines in the ${one.title.toLowerCase()}`}
                className="mt-1.5 flex flex-wrap gap-1"
              >
                {one.machines.map(({ name, count, auxiliary }) => (
                  <li
                    key={name}
                    title={auxiliary ? "Support equipment" : undefined}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {name}
                    {count > 1 && <span className="tabular-nums"> ×{count}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => onOpen(one)}
              aria-label={`Open the ${one.title.toLowerCase()} sample`}
            >
              <SparklesIcon /> Open sample
            </Button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

export default function CapturePage() {
  const projectId = useProjectId();
  const project = useProjects().find(({ id }) => id === projectId);
  const sample = project?.sample === true;
  const shown = sampleOf(useStateValue(projectId, SAMPLE_WORLD_KEY));
  const path = useProjectPath();
  const navigate = useNavigate();
  const location = useLocation();
  const own = useProjectWorld(projectId);
  const picker = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [process, setProcess] = useStored(PROCESS_KEY, "");
  const [announcement, setAnnouncement] = useState("");
  const typed = useTypewriter(
    shown.process,
    sample && (location.state as { typing?: boolean } | null)?.typing === true,
  );

  // Blob URLs outlive the page unless they are let go.
  const previews = useRef(uploads);
  previews.current = uploads;
  useEffect(
    () => () =>
      previews.current.forEach(({ preview }) => {
        if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      }),
    [],
  );

  // The panoramas kept with the project, as they were uploaded before.
  useEffect(() => {
    if (sample) return;
    let cancelled = false;
    listDocuments(projectId)
      .then((documents) => {
        if (cancelled) return;
        const kept = documents
          // The redesign's rebuilt panorama is not one of the user's photos.
          .filter(
            ({ kind, label }) =>
              kind === "panorama" && label !== REDESIGN_PANORAMA,
          )
          .map(
            (document): Upload => ({
              id: document.id,
              documentId: document.id,
              name: document.name,
              preview: documentUrl(projectId, document.id),
              megabytes: `${(document.size / 1e6).toFixed(1)} MB`,
              room: document.label ?? document.name,
            }),
          );
        setUploads((current) => [
          ...kept.filter(({ id }) => !current.some((item) => item.id === id)),
          ...current,
        ]);
      })
      .catch(() => {
        // Without the server, new panoramas still show; they just are not kept.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, sample]);

  const update = (id: string, change: Partial<Upload>) =>
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  /** Keeps a usable panorama with the project. */
  async function keep(upload: Upload, file: File) {
    update(upload.id, { saving: true });
    try {
      const document = await uploadDocument(projectId, file, {
        kind: "panorama",
        label: upload.room,
      });
      update(upload.id, { documentId: document.id, saving: false });
    } catch (error) {
      update(upload.id, {
        saving: false,
        problem: `Not saved: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const renames = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function rename(upload: Upload, room: string) {
    update(upload.id, { room });
    if (!upload.documentId) return;
    const documentId = upload.documentId;
    clearTimeout(renames.current.get(upload.id));
    renames.current.set(
      upload.id,
      setTimeout(() => {
        void renameDocument(projectId, documentId, room).catch(() => undefined);
      }, RENAME_DELAY_MS),
    );
  }

  async function addFiles(files: Iterable<File>) {
    const all = [...files];
    const images = all.filter((file) => ACCEPTED.includes(file.type));
    const added = await Promise.all(images.map(readUpload));
    const known = new Set(previews.current.map(({ id }) => id));
    const fresh = added.filter(({ id }) => !known.has(id));
    setUploads((current) => [...current, ...fresh]);
    for (const upload of fresh) {
      if (upload.problem) continue;
      const file = images.find(
        (candidate) =>
          `${candidate.name}-${candidate.size}-${candidate.lastModified}` ===
          upload.id,
      );
      if (file) void keep(upload, file);
    }
    const unusable = added.filter(({ problem }) => problem).length;
    const skipped = all.length - images.length;
    setAnnouncement(
      [
        `${added.length} ${added.length === 1 ? "panorama" : "panoramas"} added`,
        unusable > 0 && `${unusable} not usable`,
        skipped > 0 && `${skipped} skipped, not JPG, PNG or WebP`,
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
  }

  const dragging = useWindowDrag(!sample, (files) => void addFiles(files));

  function remove(upload: Upload) {
    if (upload.preview.startsWith("blob:")) URL.revokeObjectURL(upload.preview);
    if (upload.documentId) {
      void deleteDocument(projectId, upload.documentId).catch(() => undefined);
    }
    setUploads((current) => current.filter(({ id }) => id !== upload.id));
    setAnnouncement(`Removed ${upload.room || upload.name}.`);
    addButton.current?.focus();
  }

  function onPaste(event: ClipboardEvent) {
    if (sample) return;
    const files = [...event.clipboardData.files].filter((file) =>
      ACCEPTED.includes(file.type),
    );
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  }

  const [starting, setStarting] = useState(false);
  const [buildError, setBuildError] = useState("");
  const worldProblem =
    buildError ||
    (own.world?.status === "failed" ? (own.world.error ?? "unknown error") : "");

  async function buildWorld() {
    const first = panoramas[0];
    if (!first?.documentId) return;
    setStarting(true);
    setBuildError("");
    try {
      await startWorld(projectId, first.documentId);
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  async function openSample(chosen: Sample) {
    try {
      const opened = await openSampleProject(
        chosen.name,
        projectId,
        sampleSeed(chosen),
      );
      setState(opened.id, SAMPLE_WORLD_KEY, chosen.slug);
      await loadProject(opened.id).catch(() => undefined);
      const saved = getField(opened.id, "machines");
      if (!Array.isArray(saved) || saved.length === 0) {
        setField(opened.id, "machines", sampleMachines(chosen));
      }
      navigate(`/p/${opened.id}/capture`, { state: { typing: true } });
    } catch (error) {
      setAnnouncement(
        `The sample could not be opened: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function leaveSample() {
    const back = project?.origin && getProject(project.origin);
    if (!back) {
      deleteProject(projectId);
      return;
    }
    // The project it lands in deletes this one, once this one is off screen.
    void navigate(`/p/${back.id}/capture`, {
      replace: true,
      state: { discard: projectId },
    });
  }

  const modelsConfirmed = useModelsConfirmed();
  const usable = uploads.filter((upload) => !upload.problem).length;
  const panoramas = uploads.filter(
    ({ documentId, problem }) => documentId && !problem,
  );
  const building = own.world?.status === "generating";
  const text = sample ? typed.text : process;

  return (
    <>
      <p className={ui.eyebrow}>Step 1 · Capture</p>
      <h1 className={ui.title}>Start from photos of your plant</h1>
      <p className={ui.lede}>
        Bring the 360° panoramas your 3D world is built from, one per room or
        hall, and describe how material moves through the floor.
      </p>

      {/* Asked once, before the first AI step; then it lives in the top bar. */}
      <AnimatePresence initial={false}>
        {!modelsConfirmed && (
          <motion.div
            key="model-prompt"
            exit={{ opacity: 0, height: 0, y: -16 }}
            transition={springs.snappy}
            className="overflow-hidden"
          >
            <ModelHint />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-8">
        <section
          aria-labelledby="composer-title"
          onPaste={onPaste}
          data-drag={dragging || undefined}
          className={cn(
            "relative rounded-[var(--radius-card)] border border-border bg-card transition-[border-color,box-shadow] duration-200 focus-within:border-ink focus-within:shadow-hard-sm data-drag:border-ink data-drag:shadow-hard",
            sample && "border-ink",
          )}
        >
          <h2 id="composer-title" className="sr-only">
            Panoramas and process
          </h2>

          {sample && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[calc(var(--radius-card)-1px)] bg-[#14140f] px-4 py-2.5 text-xs text-[#f5f5eb]">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                <span>
                  <strong className="font-semibold">Sample plant</strong> ·
                  read-only, not your data
                </span>
              </span>
              <button
                type="button"
                onClick={leaveSample}
                className="flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-1 font-semibold outline-none hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50"
              >
                <LogOutIcon className="size-3.5" /> Delete sample
              </button>
            </div>
          )}

          <div className="p-3 pb-0">
            {sample ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
                <PanoTile
                  src={shown.pano}
                  meta="2:1"
                  room={shown.title}
                  sample
                />
              </ul>
            ) : uploads.length === 0 ? (
              <button
                type="button"
                ref={addButton}
                onClick={() => picker.current?.click()}
                className="grid w-full place-items-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-border bg-muted px-4 py-9 text-center text-sm text-muted-foreground outline-none transition-colors hover:border-ink focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="mb-2 grid size-12 place-items-center rounded-2xl border-2 border-ink bg-primary text-[#14140f]">
                  <ImageUpIcon className="size-5" />
                </span>
                <strong className="text-foreground">
                  Drop 360° panoramas, paste them, or click to choose
                </strong>
                <span>JPG, PNG or WebP · 2:1 ratio · up to 20 MB each</span>
              </button>
            ) : (
              <ul className="grid max-h-[340px] grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 overflow-y-auto p-0.5">
                <AnimatePresence initial={false}>
                  {uploads.map((upload) => (
                    <PanoTile
                      key={upload.id}
                      src={upload.preview}
                      meta={
                        upload.saving
                          ? "Saving…"
                          : (upload.pixels ?? upload.megabytes)
                      }
                      problem={upload.problem}
                      room={upload.room}
                      onRoom={(room) => rename(upload, room)}
                      onRemove={() => remove(upload)}
                    />
                  ))}
                  <motion.li key="add" layout transition={springs.snappy}>
                    <button
                      type="button"
                      ref={addButton}
                      onClick={() => picker.current?.click()}
                      aria-label="Add more panoramas"
                      className="grid aspect-[2/1] w-full place-items-center rounded-2xl border-[1.5px] border-dashed border-border text-muted-foreground outline-none transition-colors hover:border-ink hover:text-foreground focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <PlusIcon className="size-5" />
                    </button>
                  </motion.li>
                </AnimatePresence>
              </ul>
            )}
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept={ACCEPTED.join(",")}
              onChange={(event) => {
                void addFiles(event.target.files ?? []);
                // Lets the same file be picked again after it is removed.
                event.target.value = "";
              }}
            />
          </div>

          <div className="mx-4 mt-3 border-t border-border" />

          <div className="px-4 pt-3">
            <label
              htmlFor="process"
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium text-muted-foreground"
            >
              How does material move through your floor?
              {!sample && (
                <span className="font-normal">
                  optional, but the flow we draft is much better with it
                </span>
              )}
            </label>
            <textarea
              id="process"
              readOnly={sample}
              rows={3}
              placeholder="e.g. Raw parts arrive at the saws, go to the two lathes, wait on a rack, then get washed and packed."
              value={text}
              onChange={(event) => setProcess(event.target.value)}
              aria-describedby={sample ? "sample-note" : undefined}
              className="mt-1.5 max-h-60 min-h-24 w-full resize-none bg-transparent py-1 text-[15px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground/70"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-1 pb-3">
            {sample ? (
              <span
                id="sample-note"
                className="px-1 text-xs text-muted-foreground"
              >
                Sample description · {SAMPLE_CREDIT}
              </span>
            ) : (
              <div className="flex items-center gap-3">
                {uploads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => picker.current?.click()}
                    className={ui.button}
                  >
                    <PlusIcon /> Add panoramas
                  </button>
                )}
                <span className="px-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {uploads.length === 0
                    ? "No panoramas yet"
                    : `${usable}/${uploads.length} usable`}
                </span>
              </div>
            )}
            {sample ? (
              <Button
                asChild
                size="sm"
                className="hover:-translate-y-px hover:shadow-hard-sm"
              >
                <Link to={path("twin")}>
                  Open the sample twin <ArrowRightIcon />
                </Link>
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={ui.button}
                  disabled={panoramas.length === 0 || building || starting}
                  title={
                    panoramas.length === 0
                      ? "Add a 2:1 panorama first"
                      : "Builds a walkable 3D world from your first panorama"
                  }
                  onClick={() => void buildWorld()}
                >
                  <SparklesIcon />
                  {building
                    ? "Building…"
                    : starting
                      ? "Starting…"
                      : own.own
                        ? "Rebuild the 3D world"
                        : "Generate the 3D world"}
                </button>
                <Button
                  asChild
                  size="sm"
                  className="hover:-translate-y-px hover:shadow-hard-sm"
                >
                  <Link to={path("twin")}>
                    Continue to the twin <ArrowRightIcon />
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {!sample && (building || worldProblem || own.own) && (
            <p
              role="status"
              className={cn(
                "px-4 pb-3 text-xs",
                worldProblem ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {worldProblem
                ? `The 3D world could not be built: ${worldProblem}`
                : building
                  ? `Building your 3D world${own.world?.progress ? ` · ${own.world.progress}` : ""}. World Labs usually takes about 5 minutes; the demo world is used until yours is ready.`
                  : "Your own 3D world is ready and used in every step."}
            </p>
          )}

          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: motionTokens.duration.instant }}
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] border-2 border-ink bg-primary/85 text-sm font-semibold text-[#14140f]"
              >
                <span className="flex items-center gap-2">
                  <ImageUpIcon className="size-5" /> Drop to add panoramas
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </section>

        {!sample && <SampleWorlds onOpen={openSample} />}
      </div>
    </>
  );
}
