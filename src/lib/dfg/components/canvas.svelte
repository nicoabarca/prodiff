<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import ActivityNode from "$lib/dfg/components/node.svelte";
  import RoutedEdge from "$lib/dfg/components/edge.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected, view } from "$lib/dfg/state/view.svelte";
  import { busiestEdge, edgeWait, edgeWidth, faceCounts, findings } from "$lib/dfg/utils/face";
  import type { FaceGroup } from "$lib/dfg/types";
  import { NODE_HEIGHT, NODE_WIDTH, edgeKey, layout, type Placement } from "$lib/dfg/utils/layout";
  import { simplify } from "$lib/dfg/utils/simplify";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";

  let { graph, stale }: { graph: ResponseDfg; stale: boolean } = $props();

  const nodeTypes = { activity: ActivityNode };
  const edgeTypes = { routed: RoutedEdge };

  const simplified = $derived(simplify(graph, view));

  // The canvas paints Groups in the names and colours the user chose, so the
  // payload can stay ids-only and a rename never leaves a stale label behind.
  const groups: FaceGroup[] = $derived(
    graph.groups.map((group) => {
      const known = comparedGroups().find((candidate) => candidate.id === group.id);
      return {
        id: group.id,
        name: known?.name ?? group.id,
        color: known?.color ?? "group-original"
      };
    })
  );

  // ELK is asynchronous, so the placement lands a tick after the topology
  // changes. The token drops a result whose request has already been superseded.
  let placement = $state.raw<Placement | null>(null);
  let pending = 0;
  $effect(() => {
    const request = ++pending;
    const wanted = { graph: simplified, direction: view.direction };
    layout(wanted.graph, wanted.direction).then((laid) => {
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
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        draggable: false,
        data: {
          label: node.label,
          kind: node.kind,
          groups,
          counts: faceCounts(node.counts, groups, view.measure),
          findings: findings(node),
          significance: node.significance,
          selected: selected.id === node.id,
          direction: view.direction
        }
      }));

    const busiest = busiestEdge(simplified.edges, view.measure);
    const edges: Edge[] = simplified.edges.map((edge) => {
      const key = edgeKey(edge.source, edge.target);
      return {
        id: key,
        source: String(edge.source),
        target: String(edge.target),
        type: "routed",
        data: {
          path: placed.paths.get(key) ?? "",
          width: edgeWidth(edge.edge, busiest, view.measure),
          label: edgeWait(edge.edge, groups),
          reconnected: edge.edge === null
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
</div>
