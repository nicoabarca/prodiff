<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ActivityNode from "$lib/dfg/components/node.svelte";
  import RoutedEdge from "$lib/dfg/components/edge.svelte";
  import SimplificationControls from "$lib/dfg/components/simplification-controls.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import {
    busiest,
    edgeWait,
    edgeWidth,
    faceCounts,
    findings,
    membership,
    transitionsById
  } from "$lib/dfg/utils/face";
  import { END_ID, START_ID, type FaceGroup, type Rect } from "$lib/dfg/types";
  import { arrow } from "$lib/dfg/utils/arrow";
  import { edgeKey, layout, nodeSize, type Placement } from "$lib/dfg/utils/layout";
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

  // ELK is asynchronous, so the placement lands a tick after the topology
  // changes. The token drops a result whose request has already been superseded.
  let placement = $state.raw<Placement | null>(null);
  let pending = 0;
  $effect(() => {
    const request = ++pending;
    const wanted = { graph: simplified, direction: view.direction, measure: view.measure };
    layout(wanted.graph, wanted.direction, wanted.measure).then((laid) => {
      if (request === pending) placement = laid;
    });
  });

  const flow = $derived.by((): { nodes: Node[]; edges: Edge[] } => {
    const placed = placement;
    if (!placed) return { nodes: [], edges: [] };

    const nodes: Node[] = simplified.nodes
      .filter((node) => placed.nodes.has(node.id))
      .map((node) => ({
        id: String(node.id),
        type: "activity",
        position: placed.nodes.get(node.id) ?? { x: 0, y: 0 },
        ...nodeSize(node.id),
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
      }));

    const rect = (id: number): Rect | null => {
      const corner = placed.nodes.get(id);
      return corner ? { ...corner, ...nodeSize(id) } : null;
    };

    const busiestEdge = busiest(simplified.edges, view.measure);
    const edges: Edge[] = simplified.edges.map((edge) => {
      const key = edgeKey(edge.source, edge.target);
      const width = edgeWidth(edge.counts, busiestEdge, view.measure);
      const drawn = arrow(placed.routes.get(key) ?? [], rect(edge.target), width);
      return {
        id: key,
        source: String(edge.source),
        target: String(edge.target),
        type: "routed",
        data: {
          shaft: drawn.shaft,
          head: drawn.head,
          width,
          label: edgeWait(waits.get(key), groups),
          labelAt: drawn.label,
          boundary: edge.source === START_ID || edge.target === END_ID
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
