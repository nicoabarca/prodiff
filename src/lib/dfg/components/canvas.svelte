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
  import Refit from "$lib/dfg/components/refit.svelte";
  import SimplificationControls from "$lib/dfg/components/simplification-controls.svelte";
  import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import { shownVariant } from "$lib/dfg/state/variants.svelte";
  import {
    busiest,
    edgeWait,
    edgeWidth,
    faceCounts,
    findings,
    membership,
    shadeValue,
    transitionsById
  } from "$lib/dfg/utils/face";
  import { shadeSteps } from "$lib/groups/utils/shade";
  import { END_ID, START_ID, type FaceGroup } from "$lib/dfg/types";
  import { arrow, prepareRoute } from "$lib/dfg/utils/arrow";
  import { variantEdgeIds, variantKey } from "$lib/dfg/utils/fold";
  import { placeLabels } from "$lib/dfg/utils/labels";
  import { edgeKey, layout, nodeSize, straightRoute, type Placement } from "$lib/dfg/utils/layout";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let {
    graph,
    simplified,
    groups,
    stale,
    focus = null,
    layoutFrom = null,
    knobs = true,
    exportName = "directly-follows-graph",
    refitAt = 0,
    insetLeft = 0,
    insetRight = 0,
    viewport = $bindable<Viewport>({ x: 0, y: 0, zoom: 1 })
  }: {
    graph: ResponseDfg;
    simplified: Simplified;
    groups: FaceGroup[];
    stale: boolean;
    focus?: string | null;
    layoutFrom?: Simplified | null;
    knobs?: boolean;
    exportName?: string;
    refitAt?: number;
    insetLeft?: number;
    insetRight?: number;
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

  /** What the boxes are placed from. A split panel is handed the union of both
      cuts while the two are synced, so they share one set of coordinates; left
      to itself it places only what it draws, and nothing the other panel does
      moves it. */
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
  const measured = $derived(new Map(graph.nodes.map((node) => [node.id, node])));
  const labels = $derived(new Map(graph.nodes.map((node) => [node.id, node.label])));

  /** The edges of the Variant a row's eye icon lit, if any is still on the
      graph. */
  const highlightedEdgeIds = $derived.by(() => {
    if (shownVariant.key === null) return new Set<string>();
    const lit = graph.variants.find(
      (variant) => variantKey(variant.activities, labels) === shownVariant.key
    );
    return lit ? variantEdgeIds(lit.activities) : new Set<string>();
  });

  // ELK is asynchronous, so the placement lands a tick after the topology
  // changes. The token drops a result whose request has already been superseded.
  let placement = $state.raw<Placement | null>(null);
  let placedAt = $state(0);
  let pending = 0;
  $effect(() => {
    const request = ++pending;
    const wanted = { graph: placedGraph, direction: view.direction, measure: view.measure };
    layout(wanted.graph, wanted.direction, wanted.measure).then((laid) => {
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
            findings: findings(measured.get(node.id)),
            membership: focus ?? membership(node.counts, groups),
            exclusive: focus !== null && membership(node.counts, groups) === focus,
            selected: selected.id === node.id,
            direction: view.direction,
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
        return { edge, key, label: edgeWait(waits.get(key), shown), route: prepareRoute(points) };
      });

    const anchors = placeLabels(
      drawn
        .filter((one) => one.label !== null)
        .map((one) => ({
          key: one.key,
          route: one.route,
          text: one.label ?? ""
        })),
      [...boxes.values()]
    );

    const busiestEdge = busiest(
      simplified.edges.map((edge) => ({ counts: facing(edge.counts) })),
      view.measure
    );
    const edges: Edge[] = drawn.map(({ edge, key, label, route }) => {
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
          label,
          labelAt: anchors.get(key) ?? { x: 0, y: 0 },
          boundary: edge.source === START_ID || edge.target === END_ID,
          highlighted: highlightedEdgeIds.has(key)
        }
      };
    });

    return { nodes, edges };
  });

  // Svelte Flow owns these arrays while the user pans, so they are local state
  // re-seeded from the layout.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    nodes = flow.nodes;
    edges = flow.edges;
  });

  let exporting = $state(false);

  // The simplification knobs and Svelte Flow's own Controls are drawn inside the
  // flow's box, so a fit that only knows the box centres the graph underneath
  // them. Insetting each side by what covers it leaves the graph in the part
  // the user can actually see. Padding is in the CSS pixels Svelte Flow expects.
  // `insetRight` carries the same for an overlay a split panel does not own.
  const FIT_MARGIN = 24;
  const FLOW_CONTROLS_WIDTH = 52;
  let knobsWidth = $state(0);
  const fitViewOptions: FitViewOptions = $derived({
    padding: {
      top: `${FIT_MARGIN}px`,
      right: `${(knobs ? knobsWidth : 0) + insetRight + FIT_MARGIN}px`,
      bottom: `${FIT_MARGIN}px`,
      left: `${Math.max(FLOW_CONTROLS_WIDTH, insetLeft) + FIT_MARGIN}px`
    }
  });
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
    fitView
    {fitViewOptions}
    minZoom={0.05}
    nodesDraggable={false}
    elementsSelectable={false}
    onlyRenderVisibleElements={!exporting}
    onnodeclick={({ node }) => (selected.id = Number(node.id))}
    onpaneclick={() => (selected.id = null)}
  >
    <Background />
    <Refit at={fitAt} options={fitViewOptions} />
    <Controls showLock={false} {fitViewOptions}>
      <ExportImage name={exportName} bind:exporting />
    </Controls>
  </SvelteFlow>

  {#if knobs}
    <SimplificationControls {simplified} bind:width={knobsWidth} />
  {/if}
</div>
