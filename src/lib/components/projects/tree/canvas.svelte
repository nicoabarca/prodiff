<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import ActivityNode from "$lib/components/projects/tree/node.svelte";
  import { toFlow } from "$lib/components/projects/tree/flow";
  import { selected, view } from "$lib/state/tree.svelte";
  import { visibleNodes, type DirectedTree } from "$lib/tree";

  let { tree, stale }: { tree: DirectedTree; stale: boolean } = $props();

  const nodeTypes = { activity: ActivityNode };
  const visible = $derived(visibleNodes(tree, view));

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
      selected: selected.id,
      onToggleCollapse: toggleCollapse
    })
  );

  // Svelte Flow owns these arrays while the user pans and selects, so they are
  // local state re-seeded from the layout rather than bound to it directly.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    nodes = flow.nodes;
    edges = flow.edges;
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
