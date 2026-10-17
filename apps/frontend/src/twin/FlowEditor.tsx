import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  type FitViewOptions,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ChevronUpIcon, WorkflowIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { NumberField } from "@/components/ui/number-field";
import { ui } from "@/lib/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  EXTRA_DEFAULTS,
  type ExtraKind,
  type ExtraNode,
  type Flow,
  type FlowLink,
  type FlowMember,
  KIND_LABELS,
  freePosition,
} from "./flow";

export interface FlowMachine {
  id: string;
  name: string;
  count: number;
  /** Support equipment: drawn off the parts path, linked by "needed by". */
  auxiliary?: boolean;
  /** Marked auxiliary by the AI draft, not yet confirmed. */
  suggested?: boolean;
  /** Drawn down the node's left edge. */
  color?: string;
}

// A type literal, not an interface: React Flow wants node data it can index.
type MemberData = {
  id: string;
  kind: FlowMember["kind"];
  name: string;
  detail?: string;
  suggested?: boolean;
  color?: string;
};
type MemberNode = Node<MemberData, "member">;

// "Needed by" lines run between side handles nobody drags from; they are set
// from the selected auxiliary machine, so they cannot be mistaken for parts.
const HIDDEN_HANDLE = { opacity: 0 };

function MemberNodeView({ data, selected }: NodeProps<MemberNode>) {
  const support = data.kind === "support";
  const canNeed = data.kind === "station" || data.kind === "source";
  return (
    <div
      className={cn(ui.flowNode, ui[`flow-${data.kind}`], selected && ui.flowNodeSelected)}
      style={data.color ? { borderLeftColor: data.color } : undefined}
    >
      {support && (
        <Handle
          id="supports"
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={HIDDEN_HANDLE}
        />
      )}
      {canNeed && (
        <Handle
          id="needs"
          type="target"
          position={Position.Left}
          isConnectable={false}
          style={HIDDEN_HANDLE}
        />
      )}
      {!support && data.kind !== "source" && (
        <Handle id="in" type="target" position={Position.Top} />
      )}
      <span className={ui.flowKind}>
        {KIND_LABELS[data.kind]}
        {data.suggested && " · suggested"}
      </span>
      <strong>{data.name}</strong>
      {data.detail && <span className={ui.hint}>{data.detail}</span>}
      {!support && data.kind !== "sink" && (
        <Handle id="out" type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

const NODE_TYPES = { member: MemberNodeView };
const linkId = (from: string, to: string) => `${from}->${to}`;
const needId = (from: string, to: string) => `needs:${from}->${to}`;
const without = (links: FlowLink[] | undefined, id: string) =>
  (links ?? []).filter(({ from, to }) => from !== id && to !== id);

function extraDetail(extra: ExtraNode): string | undefined {
  if (extra.kind === "source") {
    return `one part every ${extra.value ?? EXTRA_DEFAULTS.source.value} s`;
  }
  if (extra.kind === "buffer") {
    return `holds ${extra.value ?? EXTRA_DEFAULTS.buffer.value} parts`;
  }
  return undefined;
}

function machineDetail({ count, auxiliary }: FlowMachine) {
  if (count <= 1) return undefined;
  return auxiliary ? `${count} units` : `${count} in parallel`;
}

/**
 * The diagram's nodes for the current machines and flow. Nodes the diagram
 * already has are carried over, so their measured size and selection survive.
 */
function buildNodes(
  machines: FlowMachine[],
  flow: Flow,
  current: MemberNode[],
): MemberNode[] {
  const known = new Map(current.map((node) => [node.id, node]));
  const positions = { ...flow.positions };
  const members: MemberData[] = [
    ...machines.map((machine): MemberData => ({
      id: machine.id,
      name: machine.name,
      kind: machine.auxiliary ? "support" : "station",
      detail: machineDetail(machine),
      suggested: machine.auxiliary && machine.suggested,
      color: machine.color,
    })),
    ...flow.extras.map((extra): MemberData => ({
      id: extra.id,
      name: extra.name,
      kind: extra.kind,
      detail: extraDetail(extra),
      suggested: extra.suggested,
    })),
  ];
  return members.map((data) => {
    // A node the flow has no place for yet goes below everything placed so far.
    positions[data.id] ??= freePosition(positions);
    return {
      ...known.get(data.id),
      id: data.id,
      type: "member",
      position: positions[data.id]!,
      data,
      // Machines are removed from their card, which also drops their links.
      deletable: data.kind !== "station" && data.kind !== "support",
    };
  });
}

function buildEdges(flow: Flow, current: Edge[]): Edge[] {
  const known = new Map(current.map((edge) => [edge.id, edge]));
  return [
    ...flow.links.map(({ from, to }) => ({
      ...known.get(linkId(from, to)),
      id: linkId(from, to),
      source: from,
      target: to,
      sourceHandle: "out",
      targetHandle: "in",
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
    ...(flow.needs ?? []).map(({ from, to }) => ({
      ...known.get(needId(from, to)),
      id: needId(from, to),
      source: from,
      target: to,
      sourceHandle: "supports",
      targetHandle: "needs",
      label: "needed by",
      style: { strokeDasharray: "5 5" },
      markerEnd: { type: MarkerType.Arrow },
    })),
  ];
}

const floatingCard =
  "pointer-events-auto max-h-[45dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card/90 p-4 shadow-hard-sm backdrop-blur-md";

/**
 * The material flow as an editable diagram: drag between the dots on two
 * nodes to link them, select a node or link to change or remove it.
 */
export function FlowEditor({
  machines,
  flow,
  onChange,
  layoutVersion,
  fill,
  header,
  overlayClassName,
}: {
  machines: FlowMachine[];
  flow: Flow;
  /** Takes an updater, since one gesture can change nodes and links together. */
  onChange: (update: (flow: Flow) => Flow) => void;
  /** Bump to re-centre the view, e.g. after a new draft is laid out. */
  layoutVersion: number;
  /**
   * Fill the parent edge to edge, with the toolbar and the selected node's
   * settings floating over the diagram instead of above and below it.
   */
  fill?: boolean;
  /** With `fill`, shown in the floating card above the toolbar. */
  header?: ReactNode;
  /** With `fill`, keeps the floating cards clear of the page's own bars. */
  overlayClassName?: string;
}) {
  // Follows the app's theme, not the system's.
  const { resolvedTheme } = useTheme();
  const [nodes, setNodes] = useState(() => buildNodes(machines, flow, []));
  const [edges, setEdges] = useState(() => buildEdges(flow, []));
  const desktop = useMediaQuery("(min-width: 640px)");
  // On phones the card would hide most of the diagram, so it starts folded.
  const [folded, setFolded] = useState(!desktop);
  const [selected, setSelected] = useState<{
    node?: string;
    link?: string;
  }>({});

  useEffect(() => {
    setNodes((current) => buildNodes(machines, flow, current));
    setEdges((current) => buildEdges(flow, current));
  }, [machines, flow]);

  function onNodesChange(changes: NodeChange<MemberNode>[]) {
    const next = applyNodeChanges(changes, nodes);
    setNodes(next);
    const removed = new Set(
      changes.flatMap((change) =>
        change.type === "remove" ? [change.id] : [],
      ),
    );
    const dropped = changes.some(
      (change) => change.type === "position" && change.dragging === false,
    );
    if (removed.size === 0 && !dropped) return;
    const kept = ({ from, to }: FlowLink) =>
      !removed.has(from) && !removed.has(to);
    onChange((flow) => ({
      extras: flow.extras.filter(({ id }) => !removed.has(id)),
      links: flow.links.filter(kept),
      needs: flow.needs?.filter(kept),
      positions: Object.fromEntries(
        next.map((node) => [node.id, node.position]),
      ),
    }));
  }

  function onEdgesChange(changes: EdgeChange[]) {
    setEdges((current) => applyEdgeChanges(changes, current));
    const removed = new Set(
      changes.flatMap((change) =>
        change.type === "remove" ? [change.id] : [],
      ),
    );
    if (removed.size === 0) return;
    onChange((flow) => ({
      ...flow,
      links: flow.links.filter(
        ({ from, to }) => !removed.has(linkId(from, to)),
      ),
      needs: flow.needs?.filter(
        ({ from, to }) => !removed.has(needId(from, to)),
      ),
    }));
  }

  const isNewLink = ({ source, target }: Connection | Edge) =>
    source !== target &&
    !flow.links.some(({ from, to }) => from === source && to === target);

  function onConnect({ source, target }: Connection) {
    onChange((flow) => ({
      ...flow,
      links: [...flow.links, { from: source, to: target }],
    }));
  }

  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) =>
      setSelected({ node: nodes[0]?.id, link: edges[0]?.id }),
    [],
  );

  function addExtra(kind: ExtraKind) {
    const id = `x${Date.now().toString(36)}`;
    onChange((flow) => ({
      ...flow,
      extras: [
        ...flow.extras,
        {
          id,
          kind,
          name: `New ${KIND_LABELS[kind].toLowerCase()}`,
          value: kind === "sink" ? undefined : EXTRA_DEFAULTS[kind].value,
        },
      ],
      positions: {
        ...Object.fromEntries(nodes.map((node) => [node.id, node.position])),
        [id]: freePosition(
          Object.fromEntries(nodes.map((node) => [node.id, node.position])),
        ),
      },
    }));
  }

  const editExtra = (id: string, change: Partial<ExtraNode>) =>
    onChange((flow) => ({
      ...flow,
      extras: flow.extras.map((extra) =>
        extra.id === id ? { ...extra, ...change, suggested: false } : extra,
      ),
    }));

  const removeNode = (id: string) =>
    onChange((flow) => ({
      ...flow,
      extras: flow.extras.filter((extra) => extra.id !== id),
      links: without(flow.links, id),
      needs: without(flow.needs, id),
    }));

  const addNeed = (from: string, to: string) =>
    onChange((flow) => ({
      ...flow,
      needs: [...(flow.needs ?? []), { from, to }],
    }));

  const removeNeed = (link: FlowLink) =>
    onChange((flow) => ({
      ...flow,
      needs: flow.needs?.filter(
        ({ from, to }) => from !== link.from || to !== link.to,
      ),
    }));

  const selectedExtra = flow.extras.find(({ id }) => id === selected.node);
  const selectedMachine = machines.find(({ id }) => id === selected.node);
  const selectedLink = flow.links.find(
    ({ from, to }) => linkId(from, to) === selected.link,
  );
  const selectedNeed = flow.needs?.find(
    ({ from, to }) => needId(from, to) === selected.link,
  );
  const neededBy = selectedMachine?.auxiliary
    ? (flow.needs ?? []).filter(({ from }) => from === selectedMachine.id)
    : [];
  // What could start needing the selected auxiliary machine: machines that
  // handle parts and sources, that do not need it already.
  const couldNeed = selectedMachine?.auxiliary
    ? [
        ...machines.filter(({ auxiliary }) => !auxiliary),
        ...flow.extras.filter(({ kind }) => kind === "source"),
      ].filter(({ id }) => !neededBy.some(({ to }) => to === id))
    : [];
  const nameOf = (id: string) =>
    nodes.find((node) => node.id === id)?.data.name ?? id;

  // Full screen, the diagram is framed in the space the bars and the card
  // leave, not under them.
  const fitOptions: FitViewOptions = {
    maxZoom: 1,
    ...(fill && {
      padding: {
        top: "96px",
        // Phones stack the chat and the buttons below the diagram.
        bottom: desktop ? "120px" : "190px",
        left: desktop && !folded ? "500px" : "24px",
        right: "48px",
      },
    }),
  };
  const toolbar = (
    <div className={ui.row}>
      {(["source", "buffer", "sink"] as const).map((kind) => (
        <button
          key={kind}
          className={ui.button}
          onClick={() => addExtra(kind)}
        >
          Add a {kind}
        </button>
      ))}
      <span className={ui.hint}>
        Drag from the dot under one node to the dot on top of another to link
        them. Click a node or link to change or remove it.
      </span>
    </div>
  );
  const canvas = (
    <ReactFlow<MemberNode>
      key={layoutVersion}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isNewLink}
      onSelectionChange={onSelectionChange}
      deleteKeyCode={["Backspace", "Delete"]}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      fitView
      fitViewOptions={fitOptions}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls
        showInteractive={false}
        fitViewOptions={fitOptions}
        // On phones the chat covers the corner; pinch to zoom instead.
        className={cn(fill && "max-sm:hidden!")}
      />
    </ReactFlow>
  );
  const selection = (
    <>
      {selectedExtra && (
        <div className={ui.row}>
          <div className={cn(ui.field, "min-w-40")} style={{ flex: 1 }}>
            <label htmlFor="flow-name">
              {KIND_LABELS[selectedExtra.kind]} name
            </label>
            <input
              id="flow-name"
              className={ui.input}
              value={selectedExtra.name}
              onChange={(event) =>
                editExtra(selectedExtra.id, { name: event.target.value })
              }
            />
          </div>
          {selectedExtra.kind !== "sink" && (
            <div className={ui.field}>
              <label htmlFor="flow-value">
                {EXTRA_DEFAULTS[selectedExtra.kind].label}
              </label>
              <NumberField
                id="flow-value"
                className="w-40"
                min={1}
                value={
                  selectedExtra.value ??
                  EXTRA_DEFAULTS[selectedExtra.kind].value
                }
                onValueChange={(value) =>
                  editExtra(selectedExtra.id, {
                    value: Math.max(1, value || 1),
                  })
                }
              />
            </div>
          )}
          <button
            className={ui.button}
            style={{ alignSelf: "flex-end" }}
            onClick={() => removeNode(selectedExtra.id)}
          >
            Remove
          </button>
        </div>
      )}
      {selectedMachine && !selectedMachine.auxiliary && (
        <p className={ui.hint}>
          {selectedMachine.name} is one of your machines: rename or remove it in
          the machines panel. If parts never pass through it, mark it auxiliary
          there.
        </p>
      )}
      {selectedMachine?.auxiliary && (
        <div className={ui.stack}>
          <p className={ui.hint}>
            {selectedMachine.name} is auxiliary: parts never pass through it,
            but everything that needs it stops while it is down.
          </p>
          {neededBy.map((link) => (
            <div key={link.to} className={ui.spread}>
              <span>
                Needed by <strong>{nameOf(link.to)}</strong>
              </span>
              <button
                className={ui.button}
                onClick={() => removeNeed(link)}
              >
                Remove
              </button>
            </div>
          ))}
          {couldNeed.length > 0 && (
            <div className={ui.field}>
              <label htmlFor="flow-need">
                {neededBy.length > 0 ? "Also needed by" : "Needed by"}
              </label>
              <select
                id="flow-need"
                className={ui.input}
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    addNeed(selectedMachine.id, event.target.value);
                  }
                }}
              >
                <option value="">Choose a machine or source…</option>
                {couldNeed.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {selectedNeed && !selectedExtra && !selectedMachine && (
        <div className={ui.spread}>
          <span>
            <strong>{nameOf(selectedNeed.from)}</strong> is needed by{" "}
            <strong>{nameOf(selectedNeed.to)}</strong>
          </span>
          <button
            className={ui.button}
            onClick={() => removeNeed(selectedNeed)}
          >
            Remove link
          </button>
        </div>
      )}
      {selectedLink && !selectedExtra && !selectedMachine && (
        <div className={ui.spread}>
          <span>
            Link from <strong>{nameOf(selectedLink.from)}</strong> to{" "}
            <strong>{nameOf(selectedLink.to)}</strong>
          </span>
          <button
            className={ui.button}
            onClick={() =>
              onChange((flow) => ({
                ...flow,
                links: flow.links.filter(
                  ({ from, to }) =>
                    from !== selectedLink.from || to !== selectedLink.to,
                ),
              }))
            }
          >
            Remove link
          </button>
        </div>
      )}
    </>
  );
  const anySelected = Boolean(
    selectedExtra || selectedMachine || selectedLink || selectedNeed,
  );

  if (fill) {
    return (
      <div className="relative h-full min-h-0">
        <div
          className={cn(
            ui.flowCanvas,
            "absolute inset-0 h-auto rounded-none border-0",
          )}
        >
          {canvas}
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col items-start gap-3",
            overlayClassName,
          )}
        >
          {folded ? (
            <button
              type="button"
              onClick={() => setFolded(false)}
              aria-expanded={false}
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 px-3.5 py-2 text-[13px] font-semibold shadow-hard-sm backdrop-blur-md outline-none hover:border-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <WorkflowIcon className="size-3.5" />
              Flow tools
              <ChevronUpIcon className="size-3.5 rotate-180" />
            </button>
          ) : (
            <div className={cn(floatingCard, ui.stack, "relative gap-3 pr-10")}>
              <button
                type="button"
                onClick={() => setFolded(true)}
                aria-expanded
                aria-label="Fold the flow tools"
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <ChevronUpIcon className="size-4" />
              </button>
              {header}
              {toolbar}
            </div>
          )}
          {anySelected && (
            <div className={cn(floatingCard, ui.stack, "gap-3")}>
              {selection}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={ui.stack}>
      {toolbar}
      <div className={ui.flowCanvas}>{canvas}</div>
      {selection}
    </div>
  );
}
