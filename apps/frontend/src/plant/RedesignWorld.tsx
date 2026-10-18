import { BoxIcon, ClockIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { WorldView } from "@/components/viewer/WorldView";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  type ProjectWorld,
  documentUrl,
  getOtherWorld,
  otherWorldDir,
  startOtherWorld,
  uploadDocument,
} from "@/twin/api";
import { CAMERA_HEIGHT_M } from "@/twin/project";
import type { AppliedRedesign } from "./rank";
import { type PlantView, pasteViews } from "./views";

/** How the panorama made for a redesign world is labelled among the documents. */
export const REDESIGN_PANORAMA = "Redesign";

// World Labs takes about ten minutes; asking more often only costs requests.
const POLL_MS = 15_000;

/**
 * A walkable 3D world of the redesigned plant: the approved drawings are put
 * back into the panorama they were cut from, and World Labs builds a world
 * from it, beside the twin's own world.
 */
export function RedesignWorld({
  projectId,
  record,
  drawings,
  panoramaUrl,
  onStarted,
}: {
  projectId: string;
  record: AppliedRedesign;
  /** The picked drawing of each view: what goes into the panorama. */
  drawings: { view: PlantView; src: string }[];
  /** The panorama the views were cut from. */
  panoramaUrl: string;
  onStarted: (world: NonNullable<AppliedRedesign["world"]>) => void;
}) {
  const [world, setWorld] = useState<ProjectWorld | null>(null);
  const [step, setStep] = useState("");
  const [problem, setProblem] = useState("");
  const asked = record.world;

  // Where a world asked for earlier has got to, asked again while it builds.
  useEffect(() => {
    setWorld(null);
    if (!asked) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = () =>
      getOtherWorld(projectId, asked.id)
        .then((found) => {
          if (cancelled) return;
          setWorld(found);
          if (found.status === "generating") timer = setTimeout(check, POLL_MS);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(check, POLL_MS);
        });
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, asked]);

  async function build() {
    setProblem("");
    try {
      setStep("Putting the drawings back into your panorama…");
      const panorama = await pasteViews(panoramaUrl, drawings);
      setStep("Saving the panorama…");
      const document = await uploadDocument(
        projectId,
        new File([panorama], "redesign-panorama.jpg", { type: "image/jpeg" }),
        { kind: "panorama", label: REDESIGN_PANORAMA },
      );
      setStep("Sending it to World Labs…");
      const started = await startOtherWorld(projectId, document.id);
      setWorld(started);
      onStarted({
        id: started.id,
        documentId: document.id,
        startedAt: started.startedAt,
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setStep("");
    }
  }

  const minutes = (at: number) => Math.max(0, Math.round((Date.now() - at) / 60_000));
  const busy = step !== "";
  const failed = world?.status === "failed";

  return (
    <div
      className={cn(
        ui.panel,
        "break-inside-avoid",
        // On paper only a finished world says anything; it prints as its panorama.
        world?.status !== "ready" && "print:hidden",
      )}
    >
      <div className={ui.panelTitle}>
        <span className="flex items-center gap-1.5">
          <BoxIcon className="size-4" /> The redesign in 3D
        </span>
        <span className={ui.hint}>World Labs Marble</span>
      </div>

      {world?.status === "ready" && asked ? (
        <>
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-[#14140f] print:hidden">
            <WorldView
              worldDir={otherWorldDir(projectId, asked.id)}
              cameraHeightMetres={CAMERA_HEIGHT_M}
              items={[]}
              style={{ width: "100%", height: "100%", cursor: "grab" }}
            />
          </div>
          <img
            src={documentUrl(projectId, asked.documentId)}
            alt="The panorama the 3D world was built from"
            className="hidden aspect-[2/1] w-full rounded-xl border border-border object-cover print:block"
          />
          <p className="mt-2 text-xs text-muted-foreground print:hidden">
            Drag to look around. Built from your panorama with the drawings put
            back in; your twin keeps its own world.
          </p>
          <p className="mt-2 hidden text-xs text-muted-foreground print:block">
            The panorama World Labs built the 3D world from: your photo with
            the drawings put back in.
          </p>
        </>
      ) : asked && world?.status !== "failed" ? (
        <div role="status" className="flex gap-3 text-sm">
          <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          <div className="flex flex-col gap-1">
            <strong>Building the 3D world…</strong>
            <span className="text-muted-foreground">
              Started {minutes(asked.startedAt)} min ago. It usually takes 10–12
              minutes; you can leave this page and come back.
            </span>
            {world?.progress && (
              <span className="text-xs text-muted-foreground">
                {world.progress}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Turns the approved drawings into a walkable 3D splat: each drawing
            is put back into your panorama where it was cut from, and World
            Labs builds a world from it.
          </p>
          <p className="flex gap-2 rounded-2xl border border-warning bg-warning/10 p-3 text-xs">
            <ClockIcon className="mt-px size-4 shrink-0" />
            <span>
              <strong>This takes 10–12 minutes on average</strong>, and each
              world uses World Labs credits (about US$1.20–2.40).
            </span>
          </p>
          {failed && (
            <p className={cn(ui.poor, "flex gap-1.5 text-sm")}>
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              The 3D world could not be built
              {world?.error ? `: ${world.error}` : ""}.
            </p>
          )}
          {problem && <p className={cn(ui.poor, "text-sm")}>{problem}</p>}
          <button
            type="button"
            className={cn(ui.primary, "w-fit print:hidden")}
            disabled={busy || drawings.length === 0}
            onClick={() => void build()}
            title={
              drawings.length === 0
                ? "Approve a drawing on the right first"
                : undefined
            }
          >
            <BoxIcon />
            {busy ? step : failed ? "Try again" : "Generate a 3D splat"}
          </button>
          {drawings.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Draw the changes with Nano Banana on the right and pick the one
              you like for each photo first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
