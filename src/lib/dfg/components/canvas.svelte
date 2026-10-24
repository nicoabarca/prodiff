<script lang="ts">
  import {
    SvelteFlow,
    Background,
    Controls,
    type Edge,
    type FitViewOptions,
    type Node,
    type Viewport
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import ExportImage from "$lib/components/flow-export/export-image.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ActivityNode from "$lib/dfg/components/node.svelte";
  import RoutedEdge from "$lib/dfg/components/edge.svelte";
  import Frame from "$lib/dfg/components/frame.svelte";
  import Refit from "$lib/dfg/components/refit.svelte";
  import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import { shownVariant } from "$lib/dfg/state/variants.svelte";
  import {
    busiest,
    edgeWait,
    edgeWidth,
    faceCounts,
    membership,
    shadeValue,
    transitionsById
  } from "$lib/dfg/utils/face";
  import { shadeSteps } from "$lib/groups/utils/shade";
  import { END_ID, START_ID, type FaceGroup } from "$lib/dfg/types";
  import { along, arrow, nearest, prepareRoute } from "$lib/dfg/utils/arrow";
  import { nodeDifferences, type Finding } from "$lib/dfg/utils/findings";
  import { litPath, type LitPath } from "$lib/dfg/utils/fold";
  import { light } from "$lib/dfg/utils/light";
  import { LABEL_STOPS, labelSize, settleLabels, type Size } from "$lib/dfg/utils/labels";
  import { edgeKey, layout, nodeSize, straightRoute, type Placement } from "$lib/dfg/utils/layout";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let {
    graph,
    simplified,
    findings,
    groups,
    stale,
    focus = null,
    layoutFrom = null,
    fits = true,
    exportName = "directly-follows-graph",
    refitAt = 0,
    frameOn = null,
    spotlight = null,
    viewport = $bindable<Viewport>({ x: 0, y: 0, zoom: 1 })
  }: {
    graph: ResponseDfg;
    simplified: Simplified;
    findings: Finding[];
    groups: FaceGroup[];
    stale: boolean;
    focus?: string | null;
    layoutFrom?: Simplified | null;
    fits?: boolean;
    exportName?: string;
    refitAt?: number;
    frameOn?: { ids: number[]; at: number } | null;
    spotlight?: LitPath | null;
    viewport?: Viewport;
  } = $props();

  /** The cut with only what this panel's Group reaches, which is what it lays
      out on when it lays out alone. */
  const ownGraph = $derived.by((): Simplified => {
    if (focus === null) return simplified;
    const nodes = simplified.nodes.filter((node) => (node.counts[focus]?.cases ?? 0) > 0);
    const ids = new Set(nodes.map((node) => node.id));
    const edges = simplified.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target) && (edge.counts[focus]?.cases ?? 0) > 0
    );
    return { ...simplified, nodes, edges };
  });

  /** What the boxes are placed from. A split panel is handed the whole cut, so
      both panels share one set of coordinates and an activity sits in the same
      place on either side. */
  const placedGraph = $derived(layoutFrom ?? ownGraph);

  const NO_COUNTS: Counts = { cases: 0, events: 0 };

  /**
   * The counts a panel prints from. A split panel narrows them to its one
   * Group, so every figure, shade and thickness below ranks within that Group
   * instead of across the comparison.
   */
  const facing = (counts: Record<string, Counts>): Record<string, Counts> =>
    focus === null ? counts : { [focus]: counts[focus] ?? NO_COUNTS };

  const shown = $derived(focus === null ? groups : groups.filter((group) => group.id === focus));

  const nodeTypes = { activity: ActivityNode };
  const edgeTypes = { routed: RoutedEdge };

  const waits = $derived(transitionsById(graph));
  const differences = $derived(nodeDifferences(findings));
  const labels = $derived(new Map(graph.nodes.map((node) => [node.id, node.label])));

  /** Every edge label's box, sized for every compared Group, so both split
      panels reserve the same room and place it in the same spot. */
  const labelSizes = $derived(
    new Map(
      placedGraph.edges.flatMap((edge) => {
        const key = edgeKey(edge.source, edge.target);
        const size = labelSize(edgeWait(waits.get(key), groups), groups.length > 1);
        return size ? [[key, size] as [string, Size]] : [];
      })
    )
  );

  /** The Variant a row's eye lit, if it is still on the graph, over the place
      `spotlight` names. */
  const highlight = $derived(
    light({
      variant: litPath(graph.variants, shownVariant.key, simplified.variants.keys, labels, focus),
      finding: spotlight
    })
  );

  // ELK is asynchronous, so the placement lands a tick after the topology
  // changes. The token drops a result whose request has already been superseded.
  let placement = $state.raw<Placement | null>(null);
  let placedAt = $state(0);
  let pending = 0;
  $effect(() => {
    const request = ++pending;
    const wanted = {
      graph: placedGraph,
      direction: view.direction,
      measure: view.measure,
      labels: labelSizes
    };
    layout(wanted.graph, wanted.direction, wanted.measure, wanted.labels).then((laid) => {
      if (request !== pending) return;
      placement = laid;
      placedAt += 1;
    });
  });

  // A refit asked for while a cut is changing has to wait for the placement it
  // is meant to frame, which lands a tick after the topology does.
  let asked: number | null = null;
  let waiting = false;
  let fitAt = $state(0);
  $effect(() => {
    const wanted = refitAt;
    const placed = placedAt;
    if (asked === null) {
      asked = wanted;
      return;
    }
    if (wanted !== asked) {
      asked = wanted;
      waiting = true;
      return;
    }
    if (waiting && placed > 0) {
      waiting = false;
      fitAt += 1;
    }
  });

  const flow = $derived.by((): { nodes: Node[]; edges: Edge[] } => {
    const placed = placement;
    if (!placed) return { nodes: [], edges: [] };

    const boxes = new Map(
      placedGraph.nodes.flatMap((node) => {
        const position = placed.nodes.get(node.id);
        return position ? [[node.id, { ...position, ...nodeSize(node.id) }]] : [];
      })
    );

    const steps = shadeSteps(
      simplified.nodes.map((node) =>
        shadeValue({ ...node, counts: facing(node.counts) }, view.measure)
      ),
      "log"
    );

    // A split panel draws only what its own Group reaches. The box stays in the
    // placement either way, so dropping it here never moves the rest.
    const unreachedNode = (counts: Record<string, Counts>) =>
      focus !== null && (counts[focus]?.cases ?? 0) === 0;

    const nodes: Node[] = simplified.nodes.flatMap((node, index) => {
      const box = boxes.get(node.id);
      if (!box) return [];
      if (unreachedNode(node.counts)) return [];
      // On a split panel only an activity this Group alone reaches carries its
      // accent; everything both reach is the Original's grey on both sides.
      const owner = membership(node.counts, groups);
      return [
        {
          id: String(node.id),
          type: "activity",
          position: { x: box.x, y: box.y },
          width: box.width,
          height: box.height,
          draggable: false,
          data: {
            label: node.label,
            kind: node.kind,
            groups: shown,
            counts: faceCounts(node.counts, shown, view.measure),
            shadeStep: steps[index],
            differences: differences.get(node.id) ?? null,
            membership: focus === null ? owner : owner === focus ? focus : null,
            selected: selected.id === node.id,
            direction: view.direction,
            highlighted: false,
            dimmed: false,
            focus
          }
        }
      ];
    });

    const visible = new Set(nodes.map((node) => Number(node.id)));
    const drawn = simplified.edges
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .filter((edge) => focus === null || (edge.counts[focus]?.cases ?? 0) > 0)
      .map((edge) => {
        const key = edgeKey(edge.source, edge.target);
        const points =
          placed.routes.get(key) ??
          straightRoute(
            boxes.get(edge.source) ?? null,
            boxes.get(edge.target) ?? null,
            view.direction
          );
        return { edge, key, waits: edgeWait(waits.get(key), shown), route: prepareRoute(points) };
      });

    // ELK reserves each label's room beside its edge; a label is drawn on the
    // edge's own line, at the first spot along it that covers nothing else.
    const settled = settleLabels(
      drawn.flatMap(({ edge, key, waits, route }) => {
        const reserved = placed.labels.get(key);
        const size = labelSizes.get(key);
        if (waits.length === 0 || !reserved || !size) return [];
        const onLine =
          edge.source === edge.target
            ? [reserved]
            : [nearest(route, reserved), ...LABEL_STOPS.map((stop) => along(route, stop))];
        return [{ key, size, onLine, reserved }];
      }),
      [...boxes.values()]
    );

    const busiestEdge = busiest(
      simplified.edges.map((edge) => ({ counts: facing(edge.counts) })),
      view.measure
    );
    const edges: Edge[] = drawn.map(({ edge, key, waits, route }) => {
      const width = edgeWidth(facing(edge.counts), busiestEdge, view.measure);
      const shape = arrow(route, boxes.get(edge.target) ?? null, width);
      return {
        id: key,
        source: String(edge.source),
        target: String(edge.target),
        type: "routed",
        data: {
          shaft: shape.shaft,
          head: shape.head,
          width,
          waits,
          dotted: shown.length > 1,
          labelAt: settled.get(key) ?? along(route, 0.5),
          boundary: edge.source === START_ID || edge.target === END_ID,
          highlighted: false,
          dimmed: false
        }
      };
    });

    return { nodes, edges };
  });

  // Svelte Flow owns these arrays while the user pans, so they are local state
  // re-seeded from the layout and the lit Variant. The highlight is applied over
  // the finished layout, so lighting a Variant never re-runs the layout.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const lit = highlight;
    if (lit === null) {
      nodes = flow.nodes;
      edges = flow.edges;
      return;
    }
    nodes = flow.nodes.map((node) => {
      const on = lit.nodes.has(node.id);
      return { ...node, data: { ...node.data, highlighted: on, dimmed: !on } };
    });
    edges = flow.edges.map((edge) => {
      const on = lit.edges.has(edge.id);
      return { ...edge, data: { ...edge.data, highlighted: on, dimmed: !on } };
    });
  });

  let exporting = $state(false);

  // Svelte Flow's own Controls are drawn inside the flow's box, so a fit that
  // only knows the box centres the graph underneath them. Insetting the left by
  // what covers it leaves the graph in the part the user can actually see.
  // Padding is in the CSS pixels Svelte Flow expects.
  const FIT_MARGIN = 24;
  const FLOW_CONTROLS_WIDTH = 52;
  const fitViewOptions: FitViewOptions = {
    padding: {
      top: `${FIT_MARGIN}px`,
      right: `${FIT_MARGIN}px`,
      bottom: `${FIT_MARGIN}px`,
      left: `${FLOW_CONTROLS_WIDTH + FIT_MARGIN}px`
    }
  };
</script>

<div class="relative min-h-0 flex-1 {stale ? 'opacity-60' : ''}">
  {#if placement === null}
    <div class="absolute inset-0 flex items-center justify-center p-8">
      <Skeleton class="h-full w-full" />
    </div>
  {/if}
  <SvelteFlow
    bind:nodes
    bind:edges
    bind:viewport
    {nodeTypes}
    {edgeTypes}
    fitView={fits}
    {fitViewOptions}
    minZoom={0.05}
    nodesDraggable={false}
    elementsSelectable={false}
    onlyRenderVisibleElements={!exporting}
    onnodeclick={({ node }) => (selected.id = Number(node.id))}
    onpaneclick={() => (selected.id = null)}
  >
    <Background />
    {#if fits}
      <Refit at={fitAt} options={fitViewOptions} />
    {/if}
    {#if frameOn}
      <Frame ids={frameOn.ids} at={frameOn.at} options={fitViewOptions} />
    {/if}
    <Controls showLock={false} {fitViewOptions}>
      <ExportImage name={exportName} bind:exporting />
    </Controls>
  </SvelteFlow>
</div>
