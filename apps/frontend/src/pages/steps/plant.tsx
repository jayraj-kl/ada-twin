import {
  ArrowLeftIcon,
  PrinterIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { projectKey, useProjectId, useProjectPath } from "@/lib/projects";
import { readJson, writeJson } from "@/lib/storage";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  AI_BADGE,
  ImageChat,
  type PlantMessage,
  THREAD_LIMIT,
  pickedImage,
} from "@/plant/ImageChat";
import { imageKey, loadImage, saveImage } from "@/plant/images";
import {
  type AppliedRedesign,
  DAYS,
  type PlantReport,
  TIER_LABEL,
  type Tier,
  rankChanges,
} from "@/plant/rank";
import { type PlantView, cutView, dataUrl, viewsFor } from "@/plant/views";
import { moneyRange, perPart, signed } from "@/results/format";
import {
  type InlineImage,
  explainChanges,
  illustrate,
} from "@/twin/api";
import {
  APPLIED_KEY,
  PLANT_CHAT_KEY,
  WORLD_DIR,
  useStored,
} from "@/twin/project";

const NO_APPLIED: AppliedRedesign[] = [];
const PANORAMA = `${WORLD_DIR}/pano.png`;

type Threads = Record<string, Record<string, PlantMessage[]>>;

const TIER_STYLE: Record<Tier, string> = {
  critical: "border-ink bg-destructive text-white",
  high: "border-ink bg-warning text-[#14140f]",
  medium: "border-ink bg-primary text-[#14140f]",
  low: "border-border bg-muted text-muted-foreground",
};

const when = (at: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);

export default function PlantPage() {
  const projectId = useProjectId();
  const path = useProjectPath();
  const [applied, setApplied, loaded] = useStored(APPLIED_KEY, NO_APPLIED);
  const [count, setCount] = useStored("twin-plant-count", 2);
  const [chosen, setChosen] = useState<string | null>(null);
  const record =
    applied.find(({ id }) => id === chosen) ?? applied.at(-1) ?? null;

  // Measuring and writing finish after the page may have changed the list,
  // so updates go to the newest copy of it.
  const latest = useRef(applied);
  latest.current = applied;
  const update = useCallback(
    (id: string, change: (record: AppliedRedesign) => AppliedRedesign) =>
      setApplied(
        latest.current.map((candidate) =>
          candidate.id === id ? change(candidate) : candidate,
        ),
      ),
    [setApplied],
  );

  // --- the ranking, measured once per applied redesign ----------------------
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [rankProblem, setRankProblem] = useState("");
  useEffect(() => {
    if (!record || record.report) return;
    let cancelled = false;
    setRankProblem("");
    rankChanges(record, (done, total) => !cancelled && setProgress([done, total]))
      .then((report) => {
        if (!cancelled) update(record.id, (current) => ({ ...current, report }));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setRankProblem(error instanceof Error ? error.message : String(error));
      })
      .finally(() => !cancelled && setProgress(null));
    return () => {
      cancelled = true;
    };
  }, [record, update]);

  const costText = useCallback(
    (id: string) => {
      const estimate = record?.costs[id];
      if (!estimate?.oneOff || !record) return undefined;
      return `${moneyRange(estimate.oneOff, record.currency)} once${estimate.yearly ? `, ${moneyRange(estimate.yearly, record.currency)} a year` : ""}`;
    },
    [record],
  );

  // --- the written report, once the ranking is in ---------------------------
  const [writing, setWriting] = useState(false);
  const [writeProblem, setWriteProblem] = useState("");
  const write = useCallback(
    (target: AppliedRedesign, report: PlantReport) => {
      setWriting(true);
      setWriteProblem("");
      explainChanges({
        scenario: target.run.scenario,
        before: report.before,
        after: report.after,
        bottleneck:
          target.run.graph.nodes.find(
            ({ id }) => id === target.run.baseline.bottleneck,
          )?.name ?? undefined,
        changes: report.rows.map((row) => {
          const change = target.changes.find(({ id }) => id === row.id)!;
          return {
            id: row.id,
            title: change.title,
            detail: change.detail,
            tier: row.tier,
            marginal: row.marginal,
            solo: row.solo,
            cost: costText(row.id),
          };
        }),
      })
        .then(({ summary, paragraphs }) =>
          update(target.id, (current) => ({
            ...current,
            report: current.report && { ...current.report, summary, paragraphs },
          })),
        )
        .catch((error: unknown) =>
          setWriteProblem(error instanceof Error ? error.message : String(error)),
        )
        .finally(() => setWriting(false));
    },
    [costText, update],
  );
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!record?.report || record.report.summary !== undefined) return;
    // Once per page: a failure waits for the retry button.
    if (asked.current.has(record.id)) return;
    asked.current.add(record.id);
    write(record, record.report);
  }, [record, write]);

  // --- the photos -------------------------------------------------------------
  const { views, unseen } = useMemo(
    () =>
      record
        ? viewsFor(record.changes, record.machines, record.run.graph)
        : { views: [], unseen: [] },
    [record],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = views.find(({ id }) => id === activeId) ?? views[0] ?? null;

  const [threads, setThreads] = useState<Threads>({});
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const threadsKey = projectKey(projectId, PLANT_CHAT_KEY);
  useEffect(() => {
    setThreads(readJson<Threads>(threadsKey) ?? {});
    setThreadsLoaded(true);
  }, [threadsKey]);
  useEffect(() => {
    if (threadsLoaded) writeJson(threadsKey, threads);
  }, [threads, threadsLoaded, threadsKey]);
  const threadOf = (view: PlantView) =>
    (record && threads[record.id]?.[view.id]) ?? [];
  const setThread = (
    recordId: string,
    viewId: string,
    change: (thread: PlantMessage[]) => PlantMessage[],
  ) =>
    setThreads((current) => ({
      ...current,
      [recordId]: {
        ...current[recordId],
        [viewId]: change(current[recordId]?.[viewId] ?? []).slice(-THREAD_LIMIT),
      },
    }));

  // The photo as it is, cut out of the panorama when its tab is opened.
  const originals = useRef(new Map<string, InlineImage>());
  const [original, setOriginal] = useState<string | null>(null);
  const [originalProblem, setOriginalProblem] = useState("");
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const cached = originals.current.get(active.id);
    setOriginal(cached ? dataUrl(cached) : null);
    setOriginalProblem("");
    if (cached) return;
    cutView(PANORAMA, active)
      .then((image) => {
        originals.current.set(active.id, image);
        if (!cancelled) setOriginal(dataUrl(image));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setOriginalProblem(
            `${error instanceof Error ? error.message : String(error)}. The photos need the world fetched in the capture step.`,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  // The drawings, read from this browser's image store as threads need them.
  const [images, setImages] = useState<Record<string, string>>({});
  const imageIds = useMemo(
    () =>
      Object.values(record ? (threads[record.id] ?? {}) : {})
        .flat()
        .flatMap(({ images }) => images ?? [])
        .filter((id): id is string => Boolean(id)),
    [record, threads],
  );
  useEffect(() => {
    const missing = imageIds.filter((id) => !(id in images));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (id) => {
        const stored = await loadImage(imageKey(projectId, id)).catch(() => undefined);
        return [id, stored ? dataUrl(stored) : ""] as const;
      }),
    ).then((loaded) => {
      if (!cancelled) setImages((current) => ({ ...current, ...Object.fromEntries(loaded) }));
    });
    return () => {
      cancelled = true;
    };
  }, [imageIds, images, projectId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  async function send(text: string) {
    if (!record || !active) return;
    const view = originals.current.get(active.id);
    if (!view) return;
    const thread = threadOf(active);
    const recordId = record.id;
    const viewId = active.id;
    const stamp = Date.now().toString(36);
    setThread(recordId, viewId, (current) => [
      ...current,
      { id: `u${stamp}`, role: "user", text },
    ]);
    setBusy(viewId);
    setPending(count);
    try {
      const picked = pickedImage(thread);
      const previous = picked
        ? (await loadImage(imageKey(projectId, picked)))?.turn
        : undefined;
      const answer = await illustrate({
        view,
        subject: active.subject,
        changes: active.lines,
        previous,
        notes: thread.filter(({ role }) => role === "user").map(({ text }) => text),
        message: text,
        count,
      });
      const ids = await Promise.all(
        answer.results.map(async (result, index) => {
          if ("error" in result || !result.image) return null;
          const id = `${recordId}:${viewId}:${stamp}-${index}`;
          await saveImage(imageKey(projectId, id), {
            ...result.image,
            turn: result.turn,
          });
          setImages((current) => ({ ...current, [id]: dataUrl(result.image!) }));
          return id;
        }),
      );
      const first = ids.findIndex(Boolean);
      const words = answer.results
        .map((result) => ("error" in result ? "" : result.text))
        .find(Boolean);
      const errors = answer.results.flatMap((result) =>
        "error" in result ? [result.error] : [],
      );
      setThread(recordId, viewId, (current) => [
        ...current,
        {
          id: `a${stamp}`,
          role: "assistant",
          text:
            first === -1
              ? (words ?? errors[0] ?? "Nano Banana made no drawing. Try saying it differently.")
              : (words ?? ""),
          images: ids,
          ...(first === -1 ? { failed: true } : { picked: first }),
          ...(answer.check?.outside ? { outside: answer.check.note } : {}),
        },
      ]);
    } catch (error) {
      setThread(recordId, viewId, (current) => [
        ...current,
        {
          id: `e${stamp}`,
          role: "assistant",
          text: error instanceof Error ? error.message : String(error),
          failed: true,
        },
      ]);
    } finally {
      setBusy(null);
    }
  }

  function pick(messageId: string, index: number) {
    if (!record || !active) return;
    setThread(record.id, active.id, (thread) =>
      thread.map((message) =>
        message.id === messageId ? { ...message, picked: index } : message,
      ),
    );
  }

  // --- the page ---------------------------------------------------------------
  if (!loaded) return null;
  if (!record) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className={cn(ui.eyebrow, "mx-auto")}>Step 6 · New plant</p>
        <h1 className={ui.title}>Nothing applied yet</h1>
        <p className="mb-6 text-muted-foreground">
          Redesign the plant in Results, then press <strong>Apply to my twin</strong>.
          The applied changes are ranked here, and drawn into your photos.
        </p>
        <Link to={path("results")} className={ui.primary}>
          <ArrowLeftIcon /> Go to Results
        </Link>
      </div>
    );
  }

  const report = record.report;
  const changeOf = (id: string) => record.changes.find((change) => change.id === id)!;
  const viewOf = (id: string) => views.find(({ changeIds }) => changeIds.includes(id));
  const gallery = views.flatMap((view) => {
    const id = pickedImage(threadOf(view));
    return id && images[id] ? [{ view, src: images[id] }] : [];
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ui.eyebrow}>Step 6 · New plant</p>
          <h1 className={ui.title}>What the redesign changes</h1>
          <p className={cn(ui.lede, "mb-6")}>
            The changes you applied, most critical first for{" "}
            <strong className="text-foreground">{record.run.scenario.name}</strong>,
            each measured over {DAYS} simulated days. On the right, Nano Banana
            draws them into photos of your plant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {applied.length > 1 && (
            <>
              <label htmlFor="applied" className="sr-only">
                Applied redesign
              </label>
              <select
                id="applied"
                value={record.id}
                onChange={(event) => setChosen(event.target.value)}
                className={cn(ui.input, "h-9 w-auto")}
              >
                {[...applied].reverse().map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    Applied {when(candidate.at)} · {candidate.changes.length} changes
                  </option>
                ))}
              </select>
            </>
          )}
          <button className={cn(ui.button, "h-9")} onClick={() => window.print()}>
            <PrinterIcon /> Print
          </button>
          <Link to={path("results")} className={cn(ui.button, "h-9")}>
            <ArrowLeftIcon /> Results
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* The report. */}
        <section aria-label="Applied changes" className="flex flex-col gap-4">
          {!report ? (
            <div className={ui.panel}>
              <p className="text-sm font-semibold">
                {rankProblem ? "The changes could not be measured" : "Measuring each change…"}
              </p>
              {rankProblem ? (
                <p className="mt-1 text-sm text-destructive">{rankProblem}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The shift runs {DAYS} days with and without each change, on standard rules.
                  </p>
                  <div className={cn(ui.timeline, "mt-3")}>
                    <div style={{ width: `${progress ? (progress[0] / progress[1]) * 100 : 4}%` }} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className={ui.kpi}>
                  <div className={ui.kpiLabel}>Before, parts per shift</div>
                  <div className={ui.kpiValue}>{Math.round(report.before)}</div>
                </div>
                <div className={cn(ui.kpi, "border-ink")}>
                  <div className={ui.kpiLabel}>With the redesign</div>
                  <div className={ui.kpiValue}>{Math.round(report.after)}</div>
                  <div className={cn(ui.delta, report.after >= report.before ? ui.good : ui.poor)}>
                    {signed(report.after - report.before, 1)} a shift, {DAYS}-day average
                  </div>
                </div>
                {report.targets.length > 0 && (
                  <div className={cn(ui.kpi, "col-span-2")}>
                    <div className={ui.kpiLabel}>Scenario targets, before → with the redesign</div>
                    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {report.targets.map((target) => (
                        <li key={target.name} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                          {target.name}
                          <span className={cn("font-mono font-semibold", target.after ? ui.good : ui.poor)}>
                            {target.before ? "met" : "missed"} → {target.after ? "met" : "missed"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className={ui.panel}>
                <div className={ui.panelTitle}>
                  <span className="flex items-center gap-1.5">
                    <SparklesIcon className="size-4" /> Summary
                  </span>
                  {report.summary !== undefined && !writing && (
                    <button
                      type="button"
                      onClick={() => write(record, report)}
                      className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground print:hidden"
                    >
                      <RefreshCwIcon className="size-3" /> Rewrite
                    </button>
                  )}
                </div>
                {writing ? (
                  <p className="text-sm text-muted-foreground">Gemini is writing the report…</p>
                ) : writeProblem ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <TriangleAlertIcon className="size-4 text-warning" />
                    The summary could not be written ({writeProblem}). The ranking below stands on its own.
                    <button className={cn(ui.button, "h-8")} onClick={() => write(record, report)}>
                      Write the summary
                    </button>
                  </p>
                ) : (
                  <p className="text-sm">{report.summary || "No summary yet."}</p>
                )}
              </div>

              <ol className="flex flex-col gap-3">
                {report.rows.map((row, index) => {
                  const change = changeOf(row.id);
                  const cost = record.costs[row.id];
                  const each = cost ? perPart(cost, row.marginal) : null;
                  const view = viewOf(row.id);
                  const together = row.solo < 1 && row.marginal >= 1;
                  return (
                    <li key={row.id} className={cn(ui.panel, "break-inside-avoid")}>
                      <div className="flex items-start gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink font-mono text-sm font-semibold">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("rounded-full border px-2 py-px text-[11px] font-semibold tracking-wide uppercase", TIER_STYLE[row.tier])}>
                              {TIER_LABEL[row.tier]}
                            </span>
                            {change.origin && (
                              <span className={ui.tag}>
                                {change.origin === "asked" ? "You asked" : "Suggested"}
                              </span>
                            )}
                            {together && <span className={ui.tag}>Only with the others</span>}
                            {row.marginal <= -1 && (
                              <span className={cn(ui.tag, ui.tagAssumed)}>Better without it</span>
                            )}
                          </div>
                          <h2 className="mt-1.5 font-semibold">{change.title}</h2>
                          {row.needed.length > 0 && (
                            <p className="mt-0.5 text-xs font-semibold text-destructive">
                              Without it the plant misses: {row.needed.join(", ")}
                            </p>
                          )}
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {report.paragraphs?.[row.id] ?? change.detail}
                          </p>
                          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Without it</dt>
                              <dd className="font-mono font-semibold">{signed(-row.marginal, 1)}/shift</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">On its own</dt>
                              <dd className="font-mono font-semibold">{signed(row.solo, 1)}/shift</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Cost</dt>
                              <dd className="font-mono font-semibold">
                                {costText(row.id) ?? "not looked up"}
                                {each !== null && (
                                  <span className="block font-normal text-muted-foreground">
                                    {moneyRange({ low: each, high: each }, record.currency)} per part a shift
                                  </span>
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-2 text-xs print:hidden">
                            {view ? (
                              <button
                                type="button"
                                onClick={() => setActiveId(view.id)}
                                className="font-semibold underline-offset-4 hover:underline"
                              >
                                See it in the photo of {view.label} →
                              </button>
                            ) : (
                              <span className="text-muted-foreground">
                                No photo: {unseen.find(({ change: other }) => other.id === row.id)?.reason.toLowerCase() ?? "nothing to see"}.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-muted-foreground">
                "Without it" is what the redesign loses when only this change is
                taken out, so changes that work together count. The parts don&apos;t
                add up to the total when changes overlap.
              </p>
            </>
          )}

          {gallery.length > 0 && (
            <div className={cn(ui.panel, "break-inside-avoid")}>
              <div className={ui.panelTitle}>
                In your photos
                <span className={ui.hint}>{AI_BADGE}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {gallery.map(({ view, src }) => (
                  <figure key={view.id} className="flex flex-col gap-1">
                    <img src={src} alt={`${view.label} as the AI drew it`} className="aspect-[16/9] w-full rounded-xl border border-border object-cover" />
                    <figcaption className="text-xs text-muted-foreground">{view.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* The photos, and the conversation about them. */}
        <aside
          aria-label="Your plant in photos"
          className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:h-[calc(100svh-6.5rem)] lg:overflow-y-auto print:hidden"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Your plant, redesigned</h2>
            <span className={ui.hint}>Nano Banana · a visual aid, not a drawing to build from</span>
          </div>
          {active ? (
            <ImageChat
              views={views}
              active={active}
              onActive={setActiveId}
              thread={threadOf(active)}
              images={images}
              original={original}
              originalProblem={originalProblem}
              busy={busy === active.id}
              pending={pending}
              count={count}
              onCount={setCount}
              onSend={(text) => void send(text)}
              onPick={pick}
              resultsPath={path("results")}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              None of these changes is something you can see on the floor, or
              the machines they change have no pins in the world. Pin them in
              the{" "}
              <Link to={path("twin")} className="underline">
                twin step
              </Link>{" "}
              to draw them.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Drawings stay in this browser. Clearing its site data removes them.
          </p>
        </aside>
      </div>
    </>
  );
}
