import {
  ArrowRightIcon,
  BoxIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
  PinIcon,
  PlusIcon,
  ScanSearchIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motionTokens, springs } from "@/lib/motion";
import { readJson, writeJson } from "@/lib/storage";
import { useMediaQuery } from "@/lib/use-media-query";
import { NumberField } from "@/components/ui/number-field";
import { MACHINE_COLORS, nextColor, withColors } from "@/twin/colors";
import {
  type Point,
  WorldView,
  type WorldViewHandle,
} from "@/components/viewer/WorldView";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { projectKey, useProjectId, useProjectPath } from "@/lib/projects";
import {
  type Machine,
  type Param,
  type Provenance,
  draftFlow,
  findParameters,
  locate,
  reviseFlow,
} from "@/twin/api";
import { FlowChat, type FlowChatMessage } from "@/twin/FlowChat";
import {
  EMPTY_FLOW,
  EXTRA_DEFAULTS,
  FLOW_KEY,
  type Flow,
  type FlowMember,
  PROCESS_KEY,
  flowProblems,
  flowWarnings,
  layoutFlow,
} from "@/twin/flow";
import { FlowEditor, type FlowMachine } from "@/twin/FlowEditor";
import {
  CAMERA_HEIGHT_M,
  MACHINES_KEY,
  WORLD_DIR,
  paramsFor,
  stationParam,
} from "@/twin/project";

const DRAWER_KEY = "twin-drawer";
const CHAT_KEY = "twin-flow-chat";
// Enough to follow the conversation; older turns, and their undo, drop off.
const CHAT_LIMIT = 30;

type ChatMessage = FlowChatMessage & {
  /** Which machines were auxiliary before the answer, to undo it fully. */
  beforeAuxiliary?: Record<
    string,
    { auxiliary?: boolean; auxiliarySuggested?: boolean }
  >;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** A short account of what changed between two flows, e.g. "+1 buffer". */
function describeChanges(before: Flow, after: Flow): string[] {
  const key = ({ from, to }: { from: string; to: string }) => `${from}>${to}`;
  const diff = (
    a: { from: string; to: string }[],
    b: { from: string; to: string }[],
  ) => {
    const was = new Set(a.map(key));
    const now = new Set(b.map(key));
    return [
      b.filter((link) => !was.has(key(link))).length,
      a.filter((link) => !now.has(key(link))).length,
    ];
  };
  const changes: string[] = [];
  const [linksIn, linksOut] = diff(before.links, after.links);
  const [needsIn, needsOut] = diff(before.needs ?? [], after.needs ?? []);
  const old = new Map(before.extras.map((extra) => [extra.id, extra]));
  const kept = new Set(after.extras.map(({ id }) => id));
  for (const kind of ["source", "buffer", "sink"] as const) {
    const added = after.extras.filter(
      (extra) => extra.kind === kind && !old.has(extra.id),
    ).length;
    const removed = before.extras.filter(
      (extra) => extra.kind === kind && !kept.has(extra.id),
    ).length;
    if (added) changes.push(`+${plural(added, kind)}`);
    if (removed) changes.push(`−${plural(removed, kind)}`);
  }
  if (linksIn) changes.push(`+${plural(linksIn, "link")}`);
  if (linksOut) changes.push(`−${plural(linksOut, "link")}`);
  if (needsIn) changes.push(`+${needsIn} needed by`);
  if (needsOut) changes.push(`−${needsOut} needed by`);
  const edited = after.extras.filter((extra) => {
    const was = old.get(extra.id);
    return was && (was.name !== extra.name || was.value !== extra.value);
  }).length;
  if (edited) changes.push(`${edited} edited`);
  return changes;
}

interface Entry extends Machine {
  /** Its colour in the drawer, on its pins and in the flow. */
  color?: string;
  /** One pin per unit that has been placed, at most `count` of them. */
  pins?: Point[];
  /** Why the machine is where it is, or why it could not be placed. */
  placement?: string;
  params?: Record<string, Param>;
  /** Marked auxiliary by the AI draft, and not yet confirmed by the user. */
  auxiliarySuggested?: boolean;
  /** New equipment an applied redesign added. */
  added?: "redesign";
  documents?: File[];
  busy?: boolean;
  problem?: string;
}

function Source({ provenance }: { provenance: Provenance }) {
  if (provenance.kind === "doc") {
    return (
      <span
        className={cn(ui.tag, ui.tagDoc, "max-w-full truncate")}
        title={`${provenance.document}${provenance.page ? ` p. ${provenance.page}` : ""}`}
      >
        {provenance.document}
        {provenance.page ? ` p. ${provenance.page}` : ""}
      </span>
    );
  }
  if (provenance.kind === "web") {
    return (
      <a
        href={provenance.url}
        target="_blank"
        rel="noreferrer"
        title={[provenance.url, provenance.quote && `“${provenance.quote}”`]
          .filter(Boolean)
          .join("\n")}
        className={cn(ui.tag, ui.tagUser, "max-w-full truncate")}
      >
        {provenance.confidence === "datasheet"
          ? "Datasheet"
          : "Industry typical"}{" "}
        · {new URL(provenance.url).hostname}
      </a>
    );
  }
  return (
    <span className={cn(ui.tag, ui.tagAssumed)}>
      {provenance.kind === "user" ? "Set by you" : "Assumed"}
    </span>
  );
}

export default function TwinPage() {
  const projectId = useProjectId();
  const path = useProjectPath();
  const world = useRef<WorldViewHandle>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCount, setDraftCount] = useState(1);
  const [placing, setPlacing] = useState<string | null>(null);
  // The one pin being corrected: which machine, and which of its units.
  const [moving, setMoving] = useState<{ id: string; index: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [flow, setFlow] = useState<Flow>(EMPTY_FLOW);
  const [process, setProcess] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [flowMessage, setFlowMessage] = useState("");
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const desktop = useMediaQuery("(min-width: 640px)");
  const sheetDrag = useDragControls();
  const [view, setView] = useState<"world" | "flow">("world");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const drawerKey = projectKey(projectId, DRAWER_KEY);
  // Unset until the list has loaded: open when there is nothing listed yet.
  const [drawerChoice, setDrawerChoice] = useState<boolean | null>(() =>
    readJson<boolean>(drawerKey),
  );
  const drawer = drawerChoice ?? false;
  // Decided once, as the list loads, so adding the first machine keeps it open.
  useEffect(() => {
    if (loaded && drawerChoice === null) setDrawerChoice(entries.length === 0);
  }, [loaded, drawerChoice, entries.length]);
  const setDrawer = (next: boolean | ((open: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(drawer) : next;
    setDrawerChoice(value);
    writeJson(drawerKey, value);
  };
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen =
    typeof document !== "undefined" && document.fullscreenEnabled;

  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen();
  }

  // The list lives in this browser until projects are stored on the server.
  useEffect(() => {
    try {
      const savedFlow = localStorage.getItem(projectKey(projectId, FLOW_KEY));
      const stored: Partial<Flow> = savedFlow ? JSON.parse(savedFlow) : {};
      // An early version linked auxiliary machines by "monitors" instead of
      // marking them; what monitored something becomes auxiliary.
      const { monitors, ...rest } = stored;
      const legacy = new Set((monitors ?? []).map(({ from }) => from));
      setFlow({ ...EMPTY_FLOW, ...rest, needs: rest.needs ?? monitors ?? [] });

      const saved = localStorage.getItem(projectKey(projectId, MACHINES_KEY));
      if (saved) {
        // Lists saved before a machine could have several pins had one `pin`.
        const entries = JSON.parse(saved) as (Entry & { pin?: Point })[];
        setEntries(
          withColors(
            entries.map(({ pin, ...entry }) => ({
              ...entry,
              pins: entry.pins ?? (pin ? [pin] : []),
              auxiliary: entry.auxiliary || legacy.has(entry.id) || undefined,
            })),
          ),
        );
      }
      setChat(readJson<ChatMessage[]>(projectKey(projectId, CHAT_KEY)) ?? []);
      // Saved as JSON by the capture step.
      const process = localStorage.getItem(projectKey(projectId, PROCESS_KEY));
      setProcess(process === null ? "" : (JSON.parse(process) as string));
    } catch {
      // A private window or corrupt entry just starts from an empty list.
    }
    setLoaded(true);
  }, [projectId]);
  useEffect(() => {
    if (!loaded) return;
    try {
      const plain = entries.map((entry) => ({
        ...entry,
        documents: undefined,
        busy: undefined,
        problem: undefined,
      }));
      localStorage.setItem(
        projectKey(projectId, MACHINES_KEY),
        JSON.stringify(plain),
      );
    } catch {
      // Not being able to save is not worth interrupting the user for.
    }
  }, [entries, loaded, projectId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        projectKey(projectId, FLOW_KEY),
        JSON.stringify(flow),
      );
    } catch {
      // As above.
    }
  }, [flow, loaded, projectId]);

  useEffect(() => {
    if (loaded)
      writeJson(projectKey(projectId, CHAT_KEY), chat.slice(-CHAT_LIMIT));
  }, [chat, loaded, projectId]);

  // Keyed on what the diagram shows, so typing in a card's other fields does
  // not rebuild it.
  const machineKey = entries
    .map(
      ({ id, name, count, auxiliary, auxiliarySuggested, color }) =>
        `${id}\t${name}\t${count ?? 1}\t${auxiliary ? 1 : 0}\t${auxiliarySuggested ? 1 : 0}\t${color ?? ""}`,
    )
    .join("\n");
  const flowMachines = useMemo(
    (): FlowMachine[] =>
      machineKey
        ? machineKey.split("\n").map((line) => {
            const [id, name, count, auxiliary, suggested, color] =
              line.split("\t");
            return {
              id: id!,
              name: name!,
              count: Number(count),
              auxiliary: auxiliary === "1",
              suggested: suggested === "1",
              color: color || undefined,
            };
          })
        : [],
    [machineKey],
  );
  const members = useMemo(
    (): FlowMember[] => [
      ...flowMachines.map(({ id, name, auxiliary }) => ({
        id,
        name,
        kind: auxiliary ? ("support" as const) : ("station" as const),
      })),
      ...flow.extras,
    ],
    [flowMachines, flow.extras],
  );
  const problems = useMemo(
    () => flowProblems(members, flow.links, flow.needs),
    [members, flow.links, flow.needs],
  );
  const warnings = useMemo(
    () => flowWarnings(members, flow.needs),
    [members, flow.needs],
  );

  // Esc backs out one level: a pin in progress, then the help, then the panel.
  const escape = useRef(() => {});
  escape.current = () => {
    if (placing || moving) {
      setPlacing(null);
      setMoving(null);
    } else if (help) setHelp(false);
    else if (drawer) setDrawer(false);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) escape.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Sends a request about the flow and applies the answer, undoably. */
  async function askFlow(text: string) {
    const request: ChatMessage = {
      id: `c${Date.now().toString(36)}`,
      role: "user",
      text,
    };
    const conversation = [...chat.filter(({ failed }) => !failed), request];
    setChat((current) => [...current, request]);
    setAsking(true);
    const before = flow;
    const beforeAuxiliary = Object.fromEntries(
      entries.map(({ id, auxiliary, auxiliarySuggested }) => [
        id,
        { auxiliary, auxiliarySuggested },
      ]),
    );
    try {
      const revised = await reviseFlow(
        `${window.location.origin}${WORLD_DIR}/pano.png`,
        flowMachines.map(({ id, name, count, auxiliary, suggested }) => ({
          id,
          name,
          count,
          auxiliary: auxiliary && !suggested,
        })),
        process,
        {
          nodes: flow.extras.map(({ id, kind, name, value }) => ({
            id,
            kind,
            name,
            value,
          })),
          edges: flow.links,
          needs: flow.needs ?? [],
        },
        conversation.map(({ role, text }) => ({ role, text })),
      );

      // Asked for by the user, so a machine made auxiliary here is confirmed;
      // a suggestion of the draft's that the answer drops goes away.
      const support = new Set(revised.support);
      const nextEntries = entries.map((entry) => {
        if (support.has(entry.id) && !entry.auxiliary) {
          return { ...entry, auxiliary: true, auxiliarySuggested: undefined };
        }
        if (!support.has(entry.id) && entry.auxiliarySuggested) {
          return {
            ...entry,
            auxiliary: undefined,
            auxiliarySuggested: undefined,
          };
        }
        return entry;
      });
      setEntries(nextEntries);

      const previous = new Map(flow.extras.map((extra) => [extra.id, extra]));
      const extras = revised.nodes.map((node) => {
        const old = previous.get(node.id);
        return {
          id: node.id,
          kind: node.kind,
          name: node.name,
          value:
            node.kind === "sink"
              ? undefined
              : (node.value ?? old?.value ?? EXTRA_DEFAULTS[node.kind].value),
          // Untouched nodes keep their mark; what the user asked for is theirs.
          suggested:
            old && old.name === node.name && old.kind === node.kind
              ? old.suggested
              : undefined,
        };
      });
      const drawn: FlowMember[] = [
        ...nextEntries.map(({ id, name, auxiliary }) => ({
          id,
          name,
          kind: auxiliary ? ("support" as const) : ("station" as const),
        })),
        ...extras,
      ];
      // Nodes the user already placed stay put; new ones get a laid-out spot.
      const laidOut = layoutFlow(drawn, revised.edges, revised.needs);
      const next: Flow = {
        extras,
        links: revised.edges,
        needs: revised.needs,
        positions: Object.fromEntries(
          drawn.map(({ id }) => [id, flow.positions[id] ?? laidOut[id]!]),
        ),
      };
      const changes = describeChanges(before, next);
      setFlow(next);
      if (extras.some(({ id }) => !previous.has(id))) {
        setLayoutVersion((version) => version + 1);
      }
      setChat((current) => [
        ...current,
        {
          id: `c${Date.now().toString(36)}a`,
          role: "assistant",
          text: revised.reply,
          changes,
          ...(changes.length > 0 ? { before, beforeAuxiliary } : {}),
        },
      ]);
    } catch (error) {
      setChat((current) => [
        ...current,
        {
          id: `c${Date.now().toString(36)}e`,
          role: "assistant",
          text: error instanceof Error ? error.message : String(error),
          failed: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function undoAnswer(id: string) {
    const message = chat.find((item) => item.id === id);
    if (!message?.before) return;
    setFlow(message.before);
    const auxiliary = message.beforeAuxiliary ?? {};
    setEntries((current) =>
      current.map((entry) =>
        entry.id in auxiliary ? { ...entry, ...auxiliary[entry.id] } : entry,
      ),
    );
    setLayoutVersion((version) => version + 1);
    setChat((current) =>
      current.map((item) =>
        item.id === id ? { ...item, undone: true } : item,
      ),
    );
  }

  async function draftTheFlow() {
    const replacing = flow.links.length > 0 || flow.extras.length > 0;
    if (
      replacing &&
      !window.confirm("Replace the current material flow with a new draft?")
    ) {
      return;
    }
    setDrafting(true);
    setFlowMessage("");
    try {
      const drafted = await draftFlow(
        `${window.location.origin}${WORLD_DIR}/pano.png`,
        // A suggestion the user has not confirmed is asked about afresh.
        flowMachines.map(({ id, name, count, auxiliary, suggested }) => ({
          id,
          name,
          count,
          auxiliary: auxiliary && !suggested,
        })),
        process,
      );
      const support = new Set(drafted.support);
      setEntries((current) =>
        current.map((entry) => {
          const confirmed = entry.auxiliary && !entry.auxiliarySuggested;
          if (confirmed) return entry;
          const auxiliary = support.has(entry.id);
          return {
            ...entry,
            auxiliary: auxiliary || undefined,
            auxiliarySuggested: auxiliary || undefined,
          };
        }),
      );
      const extras = drafted.nodes.map((node) => ({
        ...node,
        value:
          node.kind === "sink" ? undefined : EXTRA_DEFAULTS[node.kind].value,
        suggested: true,
      }));
      const drawn: FlowMember[] = [
        ...flowMachines.map(({ id, name }) => ({
          id,
          name,
          kind: support.has(id) ? ("support" as const) : ("station" as const),
        })),
        ...extras,
      ];
      setFlow({
        extras,
        links: drafted.edges,
        needs: drafted.needs,
        positions: layoutFlow(drawn, drafted.edges, drafted.needs),
      });
      setLayoutVersion((version) => version + 1);
      setFlowMessage(drafted.note ?? "");
    } catch (error) {
      setFlowMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDrafting(false);
    }
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setFlow((current) => ({
      ...current,
      links: current.links.filter(({ from, to }) => from !== id && to !== id),
      needs: current.needs?.filter(({ from, to }) => from !== id && to !== id),
    }));
  }

  /**
   * An auxiliary machine handles no parts, and a machine that does is needed
   * by nothing, so switching drops the links that no longer fit.
   */
  function setAuxiliary(id: string, auxiliary: boolean) {
    update(id, {
      auxiliary: auxiliary || undefined,
      auxiliarySuggested: undefined,
    });
    setFlow((current) => ({
      ...current,
      links: auxiliary
        ? current.links.filter(({ from, to }) => from !== id && to !== id)
        : current.links,
      needs: (current.needs ?? []).filter(({ from, to }) =>
        auxiliary ? to !== id : from !== id,
      ),
    }));
  }

  const update = (id: string, change: Partial<Entry>) =>
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
    );

  function add() {
    const name = draft.trim();
    if (!name) return;
    setEntries((current) => [
      ...current,
      {
        id: `m${Date.now().toString(36)}`,
        name,
        count: draftCount,
        color: nextColor(current.map(({ color }) => color)),
      },
    ]);
    setDraft("");
    setDraftCount(1);
  }

  async function locateAll() {
    setLocating(true);
    setMessage("");
    try {
      const machines = entries.map(
        ({ id, name, type, manufacturer, model, count }) => ({
          id,
          name,
          type,
          manufacturer,
          model,
          count,
        }),
      );
      const placements = await locate(
        `${window.location.origin}${WORLD_DIR}/pano.png`,
        machines,
      );
      let placed = 0;
      let wanted = 0;
      for (const placement of placements) {
        const count = entries.find(({ id }) => id === placement.id)?.count ?? 1;
        const pins = placement.points.flatMap((uv) => {
          const pin = world.current?.castFromPanorama(...uv);
          return pin ? [pin] : [];
        });
        placed += pins.length;
        wanted += count;
        update(placement.id, {
          pins,
          placement:
            placement.note ??
            (pins.length > 0 ? "Found in the photo" : "Not found in the photo"),
        });
      }
      setMessage(
        placed === wanted
          ? `Placed all ${wanted}.`
          : `Placed ${placed} of ${wanted}. Pin the rest by hand.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLocating(false);
    }
  }

  async function research(entry: Entry) {
    update(entry.id, { busy: true, problem: undefined });
    try {
      const { params } = await findParameters(
        {
          id: entry.id,
          name: entry.name,
          type: entry.type,
          manufacturer: entry.manufacturer,
          model: entry.model,
          count: entry.count,
          auxiliary: entry.auxiliary,
        },
        entry.documents ?? [],
      );
      update(entry.id, { params, busy: false });
    } catch (error) {
      update(entry.id, {
        busy: false,
        problem: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function onPick(point: Point) {
    if (moving) {
      const pins = entries.find(({ id }) => id === moving.id)?.pins ?? [];
      update(moving.id, {
        pins: pins.map((pin, index) => (index === moving.index ? point : pin)),
        placement: "Adjusted by you",
      });
      setMoving(null);
      return;
    }
    if (!placing) return;
    const entry = entries.find(({ id }) => id === placing);
    if (!entry) return;
    const count = entry.count ?? 1;
    const pins = entry.pins ?? [];
    // With every unit already pinned, a new click starts the pins over.
    const next = pins.length >= count ? [point] : [...pins, point];
    update(placing, { pins: next, placement: "Pinned by you" });
    // Stays in placing mode until each unit has its pin.
    if (next.length >= count) setPlacing(null);
  }

  function removeMoving() {
    if (!moving) return;
    const pins = entries.find(({ id }) => id === moving.id)?.pins ?? [];
    update(moving.id, {
      pins: pins.filter((_, index) => index !== moving.index),
      placement: "Adjusted by you",
    });
    setMoving(null);
  }

  const unitName = (entry: Entry, index: number) =>
    (entry.count ?? 1) > 1 ? `${entry.name} ${index + 1}` : entry.name;
  const movingEntry = entries.find((entry) => entry.id === moving?.id);
  const placingEntry = entries.find((entry) => entry.id === placing);
  const items = entries.flatMap((entry) =>
    (entry.pins ?? []).slice(0, entry.count ?? 1).map((position, index) => ({
      id: `${entry.id}-${index}`,
      position,
      content: (
        <button
          className={cn(
            ui.pin,
            ui.pinButton,
            moving?.id === entry.id && moving.index === index
              ? ui.pinSelected
              : "",
          )}
          title="Click to move or remove this pin"
          onClick={(event) => {
            // Keeps the click from also landing on the world underneath.
            event.stopPropagation();
            setPlacing(null);
            setMoving({ id: entry.id, index });
            setExpanded(entry.id);
          }}
        >
          <span
            className={cn(ui.dot, "ring-1 ring-white/70")}
            style={{ backgroundColor: entry.color }}
          />
          {unitName(entry, index)}
        </button>
      ),
    })),
  );

  const units = entries.reduce((sum, entry) => sum + (entry.count ?? 1), 0);
  const pinnedUnits = entries.reduce(
    (sum, entry) => sum + Math.min(entry.pins?.length ?? 0, entry.count ?? 1),
    0,
  );
  const canConfirm = entries.length > 0 && problems.length === 0;
  const confirmReason =
    entries.length === 0
      ? "Add your machines first"
      : "The material flow cannot be simulated yet";

  function pinByHand(id: string) {
    setMoving(null);
    setPlacing(id);
    setView("world");
    // The sheet covers the world on a phone; get it out of the way.
    if (!desktop) setDrawer(false);
  }

  function renderDetails(entry: Entry) {
    const hasDocuments = (entry.documents?.length ?? 0) > 0;
    const infoMissing = !hasDocuments && !(entry.manufacturer && entry.model);
    const count = entry.count ?? 1;
    const pinned = Math.min(entry.pins?.length ?? 0, count);
    return (
      <div className="flex flex-col gap-3 border-t border-border px-3 pt-3 pb-3.5">
        {entry.placement && <p className={ui.hint}>{entry.placement}</p>}

        <div className="grid grid-cols-2 gap-2.5">
          {(["type", "manufacturer", "model"] as const).map((field) => (
            <div key={field} className={ui.field}>
              <label htmlFor={`${entry.id}-${field}`}>
                {field[0]!.toUpperCase() + field.slice(1)}
              </label>
              <input
                id={`${entry.id}-${field}`}
                className={ui.input}
                value={entry[field] ?? ""}
                onChange={(event) =>
                  update(entry.id, { [field]: event.target.value })
                }
              />
            </div>
          ))}
          <div className={ui.field}>
            <label htmlFor={`${entry.id}-count`}>How many</label>
            <NumberField
              id={`${entry.id}-count`}
              className="h-[38px] w-full"
              min={1}
              max={50}
              value={entry.count ?? 1}
              onValueChange={(count) =>
                update(entry.id, { count: Math.max(1, count ?? 1) })
              }
            />
          </div>
        </div>

        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Colour
          </legend>
          {MACHINE_COLORS.map((color) => {
            const chosen = entry.color === color;
            return (
              <button
                key={color}
                type="button"
                aria-label={`Colour ${color}`}
                aria-pressed={chosen}
                onClick={() => update(entry.id, { color })}
                className={cn(
                  "size-6 rounded-full border border-ink/30 outline-none transition-[scale,box-shadow] hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  chosen &&
                    "scale-110 border-ink shadow-[0_0_0_2px_var(--card),0_0_0_3.5px_var(--ink)]",
                )}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </fieldset>

        <label className="flex gap-2.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--ink)]"
            checked={entry.auxiliary ?? false}
            onChange={(event) => setAuxiliary(entry.id, event.target.checked)}
          />
          <span>
            <strong className="text-foreground">Auxiliary</strong>: supports
            other equipment and handles no parts, like a control cabinet. Only
            its failures are simulated: what needs it stops while it is down.
            {entry.auxiliarySuggested && (
              <>
                {" "}
                <span className={cn(ui.tag, ui.tagAssumed)}>
                  Suggested by the draft
                </span>
              </>
            )}
          </span>
        </label>

        <div className={ui.field}>
          <label htmlFor={`${entry.id}-documents`}>
            Manuals, datasheets or maintenance records
          </label>
          <input
            id={`${entry.id}-documents`}
            type="file"
            className={ui.file}
            multiple
            accept="application/pdf,image/*"
            onChange={(event) =>
              update(entry.id, { documents: [...(event.target.files ?? [])] })
            }
          />
        </div>

        {infoMissing && (
          <p className={cn(ui.poor, "text-xs")}>
            Info missing: add the manufacturer and model, or a document, so we
            can look this machine up.
          </p>
        )}
        {entry.problem && (
          <p className={cn(ui.poor, "text-xs")}>{entry.problem}</p>
        )}

        <ul className="divide-y divide-border">
          {paramsFor(entry).map(({ key, label, unit, shown }) => {
            const current = stationParam(entry, key);
            return (
              <li
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <label
                    htmlFor={`${entry.id}-${key}`}
                    className="max-w-full truncate text-sm"
                  >
                    {label}
                  </label>
                  <Source provenance={current.provenance} />
                </div>
                <NumberField
                  id={`${entry.id}-${key}`}
                  size="sm"
                  className="w-[132px]"
                  min={0}
                  suffix={shown.suffix}
                  value={Math.round((current.value / shown.per) * 100) / 100}
                  onValueChange={(shownValue) =>
                    update(entry.id, {
                      params: {
                        ...entry.params,
                        [key]: {
                          value: Math.max(0, shownValue ?? 0) * shown.per,
                          unit,
                          provenance: { kind: "user" },
                        },
                      },
                    })
                  }
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <button className={ui.button} onClick={() => pinByHand(entry.id)}>
            <PinIcon />
            {pinned === 0
              ? "Pin by hand"
              : pinned < count
                ? `Pin the other ${count - pinned}`
                : count === 1
                  ? "Move pin"
                  : "Pin again"}
          </button>
          <button
            className={ui.button}
            disabled={infoMissing || entry.busy}
            onClick={() => research(entry)}
          >
            <SearchIcon />
            {entry.busy ? "Researching…" : "Find its parameters"}
          </button>
        </div>
      </div>
    );
  }

  const drawerBody = (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Machines</h2>
          <p className="text-xs text-muted-foreground">
            {entries.length === 0
              ? "Nothing listed yet"
              : `${entries.length} listed · ${pinnedUnits} of ${units} placed`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawer(false)}
          aria-label="Close the machines panel"
          className="grid size-9 place-items-center rounded-full border border-border outline-none hover:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <form
        className="flex items-end gap-2 border-b border-border px-5 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div className={cn(ui.field, "min-w-0 flex-1")}>
          <label htmlFor="draft-name">Add a machine</label>
          <input
            id="draft-name"
            className={ui.input}
            placeholder="e.g. Feed pumps"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div className={cn(ui.field, "w-28")}>
          <label htmlFor="draft-count">How many</label>
          <NumberField
            id="draft-count"
            className="h-[38px] w-full"
            min={1}
            max={50}
            value={draftCount}
            onValueChange={(count) =>
              setDraftCount(Math.min(50, Math.max(1, count ?? 1)))
            }
          />
        </div>
        <button
          className={cn(ui.primary, "h-9")}
          type="submit"
          disabled={!draft.trim()}
          aria-label="Add machine"
        >
          <PlusIcon />
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {entries.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">
              List each machine on the floor.
            </p>
            <p className="mt-1.5">
              Then press <strong>Find them in the photo</strong> and we pin them
              in the 3D world. Pin any we miss by hand, and click a pin to move
              it.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const count = entry.count ?? 1;
              const pinned = Math.min(entry.pins?.length ?? 0, count);
              const open = expanded === entry.id;
              const status =
                pinned === 0
                  ? "Not placed"
                  : pinned === count
                    ? "Placed"
                    : `${pinned} of ${count} placed`;
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-l-4 bg-background/60 transition-colors",
                    open ? "border-ink" : "border-border",
                  )}
                  style={{ borderLeftColor: entry.color }}
                >
                  <div className="flex items-center gap-1 p-1.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : entry.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <span
                        aria-hidden
                        className="size-4 shrink-0 rounded-full border border-ink"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {entry.name}
                          </span>
                          {entry.added && (
                            <span
                              className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold tracking-wide text-[#14140f] uppercase"
                              title="Added by a redesign you applied. Pin it where it will stand."
                            >
                              New · from redesign
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {count > 1 && `${count} units · `}
                          <span
                            className={cn(
                              pinned === count
                                ? "text-success"
                                : pinned > 0
                                  ? "text-warning"
                                  : undefined,
                            )}
                          >
                            {status}
                          </span>
                          {entry.auxiliary && " · Auxiliary"}
                        </span>
                      </span>
                      <ChevronDownIcon
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Options for ${entry.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent"
                      >
                        <EllipsisIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => pinByHand(entry.id)}>
                          <PinIcon /> Pin by hand
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            entry.busy ||
                            (!(entry.documents?.length ?? 0) &&
                              !(entry.manufacturer && entry.model))
                          }
                          onSelect={() => research(entry)}
                        >
                          <SearchIcon /> Find its parameters
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          destructive
                          onSelect={() => removeEntry(entry.id)}
                        >
                          <Trash2Icon /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {open && renderDetails(entry)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  // Over the diagram, in its floating card: what it is, and the draft button.
  const flowHeader = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">
            Material flow
            <span className="mt-0.5 block font-mono text-xs font-normal text-muted-foreground">
              {members.length} nodes · {flow.links.length} links
              {(flow.needs?.length ?? 0) > 0 &&
                ` · ${flow.needs!.length} needed by`}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {process ? (
              <>Your process: “{process}” </>
            ) : (
              <>
                You have not described your process, so a draft goes by the
                photo and machine names alone.{" "}
              </>
            )}
            <Link
              to={path("capture")}
              className="font-semibold text-foreground underline underline-offset-2"
            >
              Edit
            </Link>
          </p>
          {flowMessage && <p className={cn(ui.hint, "mt-1")}>{flowMessage}</p>}
        </div>
        <button
          className={ui.primary}
          disabled={drafting || entries.length === 0}
          onClick={draftTheFlow}
        >
          <SparklesIcon />
          {drafting ? "Drafting…" : "Draft the flow"}
        </button>
      </div>

      {(problems.length > 0 || warnings.length > 0) && (
        <ul className="max-h-28 list-none space-y-1 overflow-y-auto text-xs">
          {problems.map((problem) => (
            <li key={problem} className={ui.poor}>
              {problem}
            </li>
          ))}
          {warnings.map((warning) => (
            <li key={warning} className={ui.fair}>
              {warning}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // Where floating controls stop, so the open drawer does not cover them.
  const besideDrawer = desktop && drawer ? "sm:pr-[436px]" : "sm:pr-4";

  return (
    <div ref={root} className="relative h-full overflow-hidden bg-[#14140f]">
      <WorldView
        worldDir={WORLD_DIR}
        cameraHeightMetres={CAMERA_HEIGHT_M}
        items={items}
        onPick={onPick}
        handle={world}
        style={{
          position: "absolute",
          inset: 0,
          visibility: view === "world" ? "visible" : "hidden",
          cursor: placing || moving ? "crosshair" : "grab",
        }}
      />

      {view === "flow" && (
        <div className="absolute inset-0 bg-background">
          {entries.length === 0 ? (
            <div
              className={cn(
                "flex h-full flex-col gap-3 px-4 pt-20 pb-28 sm:pl-6",
                besideDrawer,
              )}
            >
              {flowHeader}
              <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
                <p>
                  Add your machines first; each one becomes a node here.
                  <br />
                  <button
                    type="button"
                    onClick={() => setDrawer(true)}
                    className="mt-2 font-semibold text-foreground underline underline-offset-2"
                  >
                    Open the machines panel
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <FlowEditor
              machines={flowMachines}
              flow={flow}
              onChange={setFlow}
              layoutVersion={layoutVersion}
              fill
              header={flowHeader}
              // Clear of the view switch above and the chat below.
              overlayClassName={cn(
                "px-4 pt-20 pb-28 transition-[padding] duration-300 sm:pl-6",
                besideDrawer,
              )}
            />
          )}
        </div>
      )}

      {/* Top: step, help and fullscreen; the world / flow switch. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4 transition-[padding] duration-300 sm:grid sm:grid-cols-[1fr_auto_1fr]",
          besideDrawer,
        )}
      >
        <div className="pointer-events-auto order-2 flex items-center gap-2 sm:order-none">
          <span className="hidden rounded-full border border-white/15 bg-[#14140f]/75 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-white uppercase backdrop-blur-md sm:inline-flex">
            <span className="mr-1.5 text-primary">Step 2</span> Twin
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setHelp((open) => !open)}
              aria-expanded={help}
              aria-label="How to use this view"
              className={glassButton}
            >
              <CircleHelpIcon className="size-4" />
            </button>
            <AnimatePresence>
              {help && (
                <motion.div
                  initial={{ opacity: 0, y: -motionTokens.distance.sm }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -motionTokens.distance.sm }}
                  transition={{ duration: motionTokens.duration.fast }}
                  className="absolute top-11 right-0 z-10 w-72 rounded-2xl border border-white/15 bg-[#14140f]/90 p-4 text-sm text-white/80 backdrop-blur-md sm:right-auto sm:left-0"
                >
                  <p className="font-semibold text-white">
                    List your machines, then place them.
                  </p>
                  <p className="mt-1.5">
                    We look for them in your photo and pin them in the 3D world.
                    Pin any we miss by hand, and click a pin to move it.
                  </p>
                  <ul className="mt-3 space-y-1 font-mono text-xs">
                    <li>W / S · move the camera</li>
                    <li>Drag · look around</li>
                    <li>Wheel · zoom</li>
                    <li>Esc · cancel or close the panel</li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              className={glassButton}
            >
              {fullscreen ? (
                <Minimize2Icon className="size-4" />
              ) : (
                <Maximize2Icon className="size-4" />
              )}
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="View"
          className="pointer-events-auto order-1 flex rounded-full border border-ink bg-card p-1 shadow-hard-sm sm:order-none"
        >
          {(
            [
              ["world", "3D world", BoxIcon],
              ["flow", "Material flow", WorkflowIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                view === key
                  ? "text-[#14140f]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view === key && (
                <motion.span
                  layoutId="twin-view"
                  transition={springs.snappy}
                  className="absolute inset-0 rounded-full bg-primary"
                />
              )}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <span className="hidden sm:block" />
      </div>

      {/* Bottom: what to do now, the machines button on phones, confirm. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 transition-[padding] duration-300 sm:grid sm:items-end",
          // The chat takes what width the side columns leave, up to 860px.
          view === "flow"
            ? "sm:grid-cols-[1fr_minmax(0,860px)_1fr]"
            : "sm:grid-cols-[1fr_auto_1fr]",
          besideDrawer,
        )}
      >
        <span className="hidden sm:block" />
        {view === "world" ? (
          <div
            role="status"
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full border border-white/15 bg-[#14140f]/80 py-1.5 pr-1.5 pl-4 text-sm text-white backdrop-blur-md max-sm:rounded-3xl"
          >
            {moving && movingEntry ? (
              <>
                <span>
                  Click where{" "}
                  <strong>{unitName(movingEntry, moving.index)}</strong> really
                  is.
                </span>
                <span className="flex gap-1.5">
                  <button className={darkPill} onClick={removeMoving}>
                    Remove this pin
                  </button>
                  <button className={darkPill} onClick={() => setMoving(null)}>
                    Cancel
                  </button>
                </span>
              </>
            ) : placing ? (
              <>
                <span>
                  Click where <strong>{placingEntry?.name}</strong>
                  {(placingEntry?.count ?? 1) > 1 &&
                    ` ${((placingEntry?.pins?.length ?? 0) % (placingEntry?.count ?? 1)) + 1} of ${placingEntry?.count}`}{" "}
                  is.
                </span>
                <button className={darkPill} onClick={() => setPlacing(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-white/80">
                  {entries.length === 0
                    ? "Add a machine first."
                    : message || `${pinnedUnits} of ${units} placed.`}
                </span>
                <button
                  className={cn(ui.primary, "h-8")}
                  disabled={locating || entries.length === 0}
                  onClick={locateAll}
                >
                  <ScanSearchIcon />
                  {locating ? "Looking…" : "Find them in the photo"}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="pointer-events-none flex justify-center">
            <FlowChat
              messages={chat}
              busy={asking}
              disabled={
                entries.length === 0 ? "Add your machines first" : undefined
              }
              problems={problems}
              onSend={(text) => void askFlow(text)}
              onUndo={undoAnswer}
              onClear={() => setChat([])}
            />
          </div>
        )}
        <div className="pointer-events-auto flex items-center justify-between gap-2 sm:justify-end">
          {!desktop && (
            <Button
              variant="outline"
              size="sm"
              className="bg-card"
              onClick={() => setDrawer(true)}
            >
              <ChevronUpIcon /> Machines · {entries.length}
            </Button>
          )}
          {canConfirm ? (
            <Button
              asChild
              size="sm"
              className="hover:-translate-y-px hover:shadow-hard-sm"
            >
              <Link to={path("scenario")}>
                Confirm the twin <ArrowRightIcon />
              </Link>
            </Button>
          ) : (
            <span
              title={confirmReason}
              tabIndex={0}
              className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <Button size="sm" disabled aria-describedby="confirm-reason">
                Confirm the twin <ArrowRightIcon />
              </Button>
              <span id="confirm-reason" className="sr-only">
                {confirmReason}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* The edge tab that opens and closes the drawer. */}
      {desktop && (
        <motion.button
          type="button"
          onClick={() => setDrawer((open) => !open)}
          aria-expanded={drawer}
          aria-controls="machines-panel"
          aria-label={
            drawer ? "Close the machines panel" : "Open the machines panel"
          }
          initial={false}
          animate={{ x: drawer ? -DRAWER_PX : 0 }}
          transition={springs.snappy}
          className="absolute top-1/2 right-0 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-ink bg-primary px-1.5 py-4 text-[#14140f] outline-none hover:pr-2.5 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {drawer ? (
            <ChevronRightIcon className="size-4" />
          ) : (
            <ChevronLeftIcon className="size-4" />
          )}
          <span className="rotate-180 text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
            Machines · {entries.length}
          </span>
        </motion.button>
      )}

      <motion.aside
        id="machines-panel"
        aria-label="Machines"
        inert={!drawer}
        initial={false}
        animate={
          desktop
            ? { x: drawer ? 0 : "100%", y: 0 }
            : { y: drawer ? 0 : "100%", x: 0 }
        }
        transition={springs.snappy}
        drag={desktop ? false : "y"}
        dragControls={sheetDrag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) setDrawer(false);
        }}
        className={cn(
          "absolute z-30 flex flex-col bg-card text-card-foreground",
          desktop
            ? "top-0 right-0 h-full border-l border-border"
            : "inset-x-0 bottom-0 h-[78%] rounded-t-[var(--radius-card)] border-t border-ink shadow-[0_-12px_40px_rgb(0_0_0/0.25)]",
        )}
        style={desktop ? { width: DRAWER_PX } : undefined}
      >
        {!desktop && (
          <div
            onPointerDown={(event) => sheetDrag.start(event)}
            className="flex cursor-grab touch-none justify-center pt-2.5 pb-1"
          >
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>
        )}
        {drawerBody}
      </motion.aside>
    </div>
  );
}

const DRAWER_PX = 420;

const glassButton =
  "grid size-9 place-items-center rounded-full border border-white/15 bg-[#14140f]/75 text-white outline-none backdrop-blur-md hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50";

const darkPill =
  "rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white outline-none hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50";
