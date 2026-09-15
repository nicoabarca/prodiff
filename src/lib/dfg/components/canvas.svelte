<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ActivityNode from "$lib/dfg/components/node.svelte";
  import RoutedEdge from "$lib/dfg/components/edge.svelte";
  import SimplificationControls from "$lib/dfg/components/simplification-controls.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import { shownVariant } from "$lib/dfg/state/variants.svelte";
  import {
    busiest,
    edgeWait,
    edgeWidth,
    faceCounts,
    findings,
    membership,
    transitionsById
  } from "$lib/dfg/utils/face";
  import { END_ID, START_ID, type FaceGroup } from "$lib/dfg/types";
  import { arrow, prepareRoute } from "$lib/dfg/utils/arrow";
  import { variantEdgeIds, variantKey } from "$lib/dfg/utils/fold";
  import { placeLabels } from "$lib/dfg/utils/labels";
  import { edgeKey, layout, nodeSize, straightRoute, type Placement } from "$lib/dfg/utils/layout";
  import { layoutGraphviz } from "$lib/dfg/utils/layout-graphviz";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let {
    graph,
    simplified,
    groups,
    stale
  }: { graph: ResponseDfg; simplified: Simplified; groups: FaceGroup[]; stale: boolean } = $props();

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
  let pending = 0;
  $effect(() => {
    const request = ++pending;
    const wanted = {
      graph: simplified,
      direction: view.direction,
      measure: view.measure,
      engine: view.engine
    };
    const promise =
      wanted.engine === "graphviz"
        ? layoutGraphviz(wanted.graph, wanted.direction, wanted.measure)
        : layout(wanted.graph, wanted.direction, wanted.measure, wanted.engine);
    promise.then((laid) => {
      if (request === pending) placement = laid;
    });
  });

  const flow = $derived.by((): { nodes: Node[]; edges: Edge[] } => {
    const placed = placement;
    if (!placed) return { nodes: [], edges: [] };

    const boxes = new Map(
      simplified.nodes.flatMap((node) => {
        const position = placed.nodes.get(node.id);
        return position ? [[node.id, { ...position, ...nodeSize(node.id) }]] : [];
      })
    );

    const nodes: Node[] = simplified.nodes.flatMap((node) => {
      const box = boxes.get(node.id);
      if (!box) return [];
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
            groups,
            counts: faceCounts(node.counts, groups, view.measure),
            findings: findings(measured.get(node.id)),
            membership: membership(node.counts, groups),
            selected: selected.id === node.id,
            direction: view.direction
          }
        }
      ];
    });

    const drawn = simplified.edges.map((edge) => {
      const key = edgeKey(edge.source, edge.target);
      const points =
        placed.routes.get(key) ??
        straightRoute(
          boxes.get(edge.source) ?? null,
          boxes.get(edge.target) ?? null,
          view.direction
        );
      return { edge, key, label: edgeWait(waits.get(key), groups), route: prepareRoute(points) };
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

    const busiestEdge = busiest(simplified.edges, view.measure);
    const edges: Edge[] = drawn.map(({ edge, key, label, route }) => {
      const width = edgeWidth(edge.counts, busiestEdge, view.measure);
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
    {nodeTypes}
    {edgeTypes}
    fitView
    minZoom={0.05}
    nodesDraggable={false}
    elementsSelectable={false}
    onlyRenderVisibleElements
    onnodeclick={({ node }) => (selected.id = Number(node.id))}
    onpaneclick={() => (selected.id = null)}
  >
    <Background />
    <Controls showLock={false} />
  </SvelteFlow>

  <SimplificationControls {simplified} />
</div>
