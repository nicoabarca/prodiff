<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import ActivityNode from "$lib/components/projects/tree/node.svelte";
  import { toFlow } from "$lib/components/projects/tree/flow";
  import { selected, selectedVariants, shownVariant, view } from "$lib/state/tree.svelte";
  import { variantPath, visibleNodes, type DirectedTree } from "$lib/tree";

  let { tree, stale }: { tree: DirectedTree; stale: boolean } = $props();

  const nodeTypes = { activity: ActivityNode };
  const visible = $derived(visibleNodes(tree, view, selectedVariants()));

  function toggleCollapse(id: number) {
    const next = new Set(view.collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    view.collapsed = next;
  }

  const flow = $derived(
    toFlow(tree, visible, {
      direction: view.direction,
      secondary: view.secondary,
      focus: view.focus,
      edgeLabels: view.edgeLabels,
      selected: selected.id,
      onToggleCollapse: toggleCollapse
    })
  );

  // Hovering a Variant in the picker lights up the path it drew. Applied over
  // the finished layout rather than inside `toFlow`, so a hover never re-runs
  // Dagre — the geometry cannot change, only what is lit.
  const highlight = $derived(
    shownVariant.key === null ? null : variantPath(tree, visible, shownVariant.key)
  );

  // Svelte Flow owns these arrays while the user pans and selects, so they are
  // local state re-seeded from the layout rather than bound to it directly.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const lit = highlight;
    if (!lit || lit.size === 0) {
      nodes = flow.nodes;
      edges = flow.edges;
      return;
    }
    nodes = flow.nodes.map((node) => {
      const on = lit.has(Number(node.id));
      // A node off the path dims; one on it keeps whatever the Group focus
      // already decided, so the two channels never fight.
      return { ...node, data: { ...node.data, dimmed: on ? node.data.dimmed : true, highlighted: on } };
    });
    edges = flow.edges.map((edge) => {
      const on = lit.has(Number(edge.source)) && lit.has(Number(edge.target));
      return { ...edge, class: on ? undefined : "opacity-15" };
    });
  });
</script>

<div class="relative min-h-0 flex-1 {stale ? 'opacity-60' : ''}">
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
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
