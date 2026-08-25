<script lang="ts">
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import ActivityNode from "$lib/tree/components/node.svelte";
  import { toFlow } from "$lib/tree/utils/flow";
  import { comparedGroups, selected, selectedVariants, shownVariant, view } from "$lib/tree/state/tree.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { variantPath, visibleNodes } from "$lib/tree/utils/tree";

  let {
    tree,
    stale,
    deselectOnPaneClick = true,
    /** Narrows the drawing to these nodes. Null draws the whole tree. */
    only = null
  }: {
    tree: ResponseDirectedTree;
    stale: boolean;
    deselectOnPaneClick?: boolean;
    only?: Set<number> | null;
  } = $props();

  const nodeTypes = { activity: ActivityNode };
  // Narrowed after the Variant and collapse rules have run: `cases` still covers
  // every surviving path, so the counts on the nodes that remain are unchanged.
  const visible = $derived.by(() => {
    const all = visibleNodes(tree, view, selectedVariants());
    if (!only) return all;
    const kept = only;
    return { ...all, ids: new Set([...all.ids].filter((id) => kept.has(id))) };
  });

  // The canvas paints Groups in the names and colours the user chose, so the
  // payload can stay ids-only and a rename never leaves a stale label behind.
  const flowGroups = $derived(
    tree.groups.map((group) => {
      const known = comparedGroups().find((candidate) => candidate?.id === group.id);
      return { id: group.id, name: known?.name ?? group.id, color: known?.color ?? "group-original" };
    })
  );

  function toggleCollapse(id: number) {
    const next = new Set(view.collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    view.collapsed = next;
  }

  const flow = $derived(
    toFlow(tree, visible, {
      groups: flowGroups,
      direction: view.direction,
      secondary: view.secondary,
      focus: view.focus,
      edgeLabels: view.edgeLabels,
      selected: selected.id,
      onToggleCollapse: toggleCollapse
    })
  );

  // Hovering a Variant in the picker lights up the path it drew. Applied over the
  // finished layout, so a hover never re-runs Dagre.
  const highlight = $derived(
    shownVariant.key === null ? null : variantPath(tree, visible, shownVariant.key)
  );

  // Svelte Flow owns these arrays while the user pans and selects, so they are
  // local state re-seeded from the layout.
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
      // A node off the path dims; one on it keeps whatever the Group focus decided.
      return {
        ...node,
        data: { ...node.data, dimmed: on ? node.data.dimmed : true, highlighted: on }
      };
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
    onpaneclick={() => {
      if (deselectOnPaneClick) selected.id = null;
    }}
  >
    <Background />
    <Controls showLock={false} />
  </SvelteFlow>
</div>
