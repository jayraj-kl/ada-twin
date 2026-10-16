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
import { Button } from "@/components/ui/button";
import { motionTokens, springs } from "@/lib/motion";
import {
  deleteProject,
  getProject,
  openSampleProject,
  useProjectId,
  useProjectPath,
  useProjects,
} from "@/lib/projects";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { PROCESS_KEY } from "@/twin/flow";
import { WORLD_DIR, useStored } from "@/twin/project";
import { SAMPLE, SAMPLE_SEED } from "@/twin/sample";

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
}

type World =
  | { state: "checking" | "missing" }
  | { state: "ready"; scale?: number };

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

function useWorld() {
  const [world, setWorld] = useState<World>({ state: "checking" });
  useEffect(() => {
    let cancelled = false;
    fetch(`${WORLD_DIR}/world.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((world) => {
        if (cancelled) return;
        setWorld({
          state: "ready",
          scale: world?.assets?.splats?.semantics_metadata?.metric_scale_factor,
        });
      })
      .catch(() => !cancelled && setWorld({ state: "missing" }));
    return () => {
      cancelled = true;
    };
  }, []);
  return world;
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
      {problem && <span className="px-1 text-xs text-destructive">{problem}</span>}
    </motion.li>
  );
}

/** The opt-in way in for someone without panoramas of their own. */
function SampleDoor({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: motionTokens.distance.sm }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -motionTokens.distance.sm }}
      transition={springs.snappy}
      className="group/door flex flex-col gap-4 rounded-[var(--radius-card)] border-[1.5px] border-dashed border-ink/40 bg-card p-5 transition-[border-color,box-shadow,translate] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-solid hover:border-ink hover:shadow-hard"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-ink bg-primary py-0.5 pr-2.5 pl-1 text-[11px] font-semibold tracking-[0.08em] text-[#14140f] uppercase">
          <span
            aria-hidden
            className="size-3.5 rounded-full border border-[#14140f] bg-[repeating-linear-gradient(135deg,#14140f_0_2px,transparent_2px_4px)]"
          />
          Sample plant
        </span>
        <span className="text-xs text-muted-foreground">No photos yet?</span>
      </div>
      <div className="relative aspect-[2/1] overflow-hidden rounded-2xl border border-border bg-muted [container-type:inline-size]">
        <div
          className="pano-pan absolute inset-0 group-focus-within/door:[animation-play-state:running] group-hover/door:[animation-play-state:running]"
          style={{ backgroundImage: `url("${SAMPLE.pano}")` }}
        />
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#14140f]/80 px-1.5 font-mono text-[10px] text-white">
          360° · {SAMPLE.title}
        </span>
      </div>
      <div>
        <h2 className="font-bold tracking-tight">Try it on a real boiler room</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opens a separate sample project with one panorama and a short process
          description. Nothing you upload is mixed in, and you can delete it any
          time. {SAMPLE.credit}.
        </p>
      </div>
      <Button variant="outline" size="sm" className="w-fit" onClick={onOpen}>
        <SparklesIcon /> Explore the sample plant
      </Button>
    </motion.section>
  );
}

function WorldCard({ world, sample }: { world: World; sample: boolean }) {
  const path = useProjectPath();
  return (
    <section className={cn(ui.panel, ui.stack)}>
      <div className={ui.panelTitle}>
        {sample ? "The sample 3D world" : "Your 3D world"}
        <span className={ui.hint}>what the twin is placed in</span>
      </div>

      <div
        className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-[repeating-linear-gradient(45deg,var(--muted)_0_12px,var(--card)_12px_24px)] bg-cover bg-center"
        style={
          world.state === "ready"
            ? {
                backgroundImage: `linear-gradient(180deg, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.5)), url("${WORLD_DIR}/pano.png")`,
              }
            : undefined
        }
      >
        {world.state === "ready" && (
          <div className={ui.viewerNote}>Panorama the world was made from</div>
        )}
      </div>

      <table className={ui.table}>
        <tbody>
          <tr>
            <td>3D world, collision mesh and panorama</td>
            <td className={ui.num}>
              {world.state === "ready"
                ? "ready"
                : world.state === "missing"
                  ? "not downloaded"
                  : "checking…"}
            </td>
          </tr>
          {world.state === "ready" && world.scale && (
            <tr>
              <td>Real-world scale</td>
              <td className={ui.num}>1 unit = {world.scale.toFixed(2)} m</td>
            </tr>
          )}
        </tbody>
      </table>

      {world.state === "missing" && (
        <p className={cn(ui.poor, "text-sm")}>
          No world has been downloaded yet. Fetch one with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            pnpm --filter @repo/scripts fetch-world &lt;worldId&gt;
          </code>
          .
        </p>
      )}

      <div className={ui.spread}>
        <span className={ui.hint}>
          Next: list the machines, find them in the photo and look up their
          numbers.
        </span>
        {world.state === "ready" ? (
          <Button asChild variant="outline" size="sm">
            <Link to={path("twin")}>
              Continue to the twin <ArrowRightIcon />
            </Link>
          </Button>
        ) : (
          <button className={ui.button} disabled>
            Continue to the twin
          </button>
        )}
      </div>
    </section>
  );
}

export default function CapturePage() {
  const projectId = useProjectId();
  const project = useProjects().find(({ id }) => id === projectId);
  const sample = project?.sample === true;
  const path = useProjectPath();
  const navigate = useNavigate();
  const location = useLocation();
  const world = useWorld();
  const picker = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [process, setProcess, processLoaded] = useStored(PROCESS_KEY, "");
  const [announcement, setAnnouncement] = useState("");
  const typed = useTypewriter(
    SAMPLE.process,
    sample && (location.state as { typing?: boolean } | null)?.typing === true,
  );

  // Blob URLs outlive the page unless they are let go.
  const previews = useRef(uploads);
  previews.current = uploads;
  useEffect(
    () => () => previews.current.forEach(({ preview }) => URL.revokeObjectURL(preview)),
    [],
  );

  async function addFiles(files: Iterable<File>) {
    const all = [...files];
    const images = all.filter((file) => ACCEPTED.includes(file.type));
    const added = await Promise.all(images.map(readUpload));
    setUploads((current) => {
      const known = new Set(current.map(({ id }) => id));
      return [...current, ...added.filter(({ id }) => !known.has(id))];
    });
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
    URL.revokeObjectURL(upload.preview);
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

  function openSample() {
    const opened = openSampleProject(SAMPLE.name, projectId, SAMPLE_SEED);
    navigate(`/p/${opened.id}/capture`, { state: { typing: true } });
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

  const usable = uploads.filter((upload) => !upload.problem).length;
  const empty = uploads.length === 0 && processLoaded && process.trim() === "";
  const showDoor = !sample && empty && world.state === "ready";
  const text = sample ? typed.text : process;

  return (
    <>
      <p className={ui.eyebrow}>Step 1 · Capture</p>
      <h1 className={ui.title}>Start from photos of your plant</h1>
      <p className={ui.lede}>
        Bring the 360° panoramas your 3D world is built from, one per room or
        hall, and describe how material moves through the floor.
      </p>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                  src={SAMPLE.pano}
                  meta="2:1"
                  room={SAMPLE.title}
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
                      meta={upload.pixels ?? upload.megabytes}
                      problem={upload.problem}
                      room={upload.room}
                      onRoom={(room) =>
                        setUploads((current) =>
                          current.map((item) =>
                            item.id === upload.id ? { ...item, room } : item,
                          ),
                        )
                      }
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
              <span id="sample-note" className="px-1 text-xs text-muted-foreground">
                Sample description · {SAMPLE.credit}
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
              <Button asChild size="sm" className="hover:-translate-y-px hover:shadow-hard-sm">
                <Link to={path("twin")}>
                  Open the sample twin <ArrowRightIcon />
                </Link>
              </Button>
            ) : (
              <button
                className={ui.primary}
                disabled
                title="Building a world from your own photos is not connected yet"
              >
                Generate the 3D world <ArrowRightIcon />
              </button>
            )}
          </div>

          {!sample && usable > 0 && (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              Building a world from your own photos is not connected yet.
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

        <div className={ui.stack}>
          <AnimatePresence initial={false}>
            {showDoor && <SampleDoor key="door" onOpen={openSample} />}
          </AnimatePresence>
          <WorldCard world={world} sample={sample} />
        </div>
      </div>
    </>
  );
}
