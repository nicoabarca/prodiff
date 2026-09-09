<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteFlow, Background, Controls, type Edge, type Node } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import ActivityNode from "$lib/tree/components/node.svelte";
  import ViewportAnchor, {
    type ViewportAnchorState
  } from "$lib/tree/components/viewport-anchor.svelte";
  import { toFlow } from "$lib/tree/utils/flow";
  import { diffKeys } from "$lib/tree/utils/diff";
  import type { Point } from "$lib/tree/utils/layout";
  import {
    comparedGroups,
    selected,
    selectedVariants,
    shownVariant,
    view
  } from "$lib/tree/state/tree.svelte";
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

  const GHOST_MS = 320;
  const ACCENT_MS = 1200;

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
      const known = comparedGroups().find((candidate) => candidate.id === group.id);
      return {
        id: group.id,
        name: known?.name ?? group.id,
        color: known?.color ?? "group-original"
      };
    })
  );

  const hasAttributes = $derived(
    Object.keys(tree.nodes[0]?.eventLevel ?? {}).length > 0 || tree.nodes[0]?.transitionTime != null
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
      secondary: hasAttributes ? view.secondary : "cases",
      focus: view.focus,
      edgeLabels: view.edgeLabels,
      selected: selected.id,
      onToggleCollapse: toggleCollapse
    })
  );

  // Hovering a Variant in the picker lights up the path it drew. Applied over the
  // finished layout, so a hover never re-runs the layout.
  const highlight = $derived.by(() => {
    if (shownVariant.key === null) return null;
    const lit = variantPath(tree, visible, shownVariant.key);
    return new Set([...lit].map((id) => flow.keys.get(id) as string));
  });

  let entering = $state.raw(new Set<string>());
  let ghostNodes = $state.raw<Node[]>([]);
  let ghostEdges = $state.raw<Edge[]>([]);
  let anchor = $state.raw<ViewportAnchorState>({
    token: 0,
    refit: false,
    before: new Map(),
    after: new Map()
  });

  let pane = $state<HTMLElement | null>(null);

  let renderedNodes: Node[] = [];
  let renderedEdges: Edge[] = [];
  let renderedTree: ResponseDirectedTree | null = null;
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;
  let accentTimer: ReturnType<typeof setTimeout> | null = null;

  function positionsOf(nodes: Node[]): Map<string, Point> {
    return new Map(nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
  }

  function clearMotion() {
    if (ghostTimer !== null) clearTimeout(ghostTimer);
    if (accentTimer !== null) clearTimeout(accentTimer);
    ghostTimer = null;
    accentTimer = null;
    ghostNodes = [];
    ghostEdges = [];
    entering = new Set();
  }

  function onRebuild(
    previous: ResponseDirectedTree,
    next: ResponseDirectedTree,
    drawn: typeof flow
  ) {
    clearMotion();

    const before = renderedNodes;
    const beforeEdges = renderedEdges;
    const sameGroups =
      previous.groups.map((group) => group.id).join("|") ===
      next.groups.map((group) => group.id).join("|");

    if (!sameGroups) {
      anchor = { token: anchor.token + 1, refit: true, before: new Map(), after: new Map() };
      return;
    }

    const diff = diffKeys(
      before.map((node) => node.id),
      drawn.nodes.map((node) => node.id)
    );

    if (diff.removed.size > 0) {
      ghostNodes = before
        .filter((node) => diff.removed.has(node.id))
        .map((node) => ({ ...node, data: { ...node.data, ghost: true } }));
      ghostEdges = beforeEdges
        .filter((edge) => diff.removed.has(edge.source) || diff.removed.has(edge.target))
        .map((edge) => ({ ...edge, class: "tree-edge-exit" }));
      ghostTimer = setTimeout(() => {
        ghostNodes = [];
        ghostEdges = [];
        ghostTimer = null;
      }, GHOST_MS);
    }

    if (diff.added.size > 0) {
      entering = diff.added;
      accentTimer = setTimeout(() => {
        entering = new Set();
        accentTimer = null;
      }, ACCENT_MS);
    }

    anchor = {
      token: anchor.token + 1,
      refit: false,
      before: positionsOf(before),
      after: positionsOf(drawn.nodes)
    };
  }

  $effect(() => {
    const current = tree;
    const drawn = untrack(() => flow);
    if (renderedTree !== null && renderedTree !== current) onRebuild(renderedTree, current, drawn);
    renderedTree = current;
  });

  $effect(() => () => clearMotion());

  // Svelte Flow owns these arrays while the user pans and selects, so they are
  // local state re-seeded from the layout, the accents and whatever is on hold.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const lit = highlight;
    const accented = entering;
    const live = flow.nodes.map((node) => {
      const on = lit === null || lit.size === 0 ? null : lit.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          entering: accented.has(node.id),
          // A node off the path dims; one on it keeps whatever the Group focus decided.
          dimmed: on === false ? true : node.data.dimmed,
          highlighted: on === true
        }
      };
    });
    const liveEdges =
      lit === null || lit.size === 0
        ? flow.edges
        : flow.edges.map((edge) => ({
            ...edge,
            class: lit.has(edge.source) && lit.has(edge.target) ? undefined : "opacity-15"
          }));

    nodes = [...ghostNodes, ...live];
    edges = [...ghostEdges, ...liveEdges];
    renderedNodes = flow.nodes;
    renderedEdges = flow.edges;
  });
</script>

<div class="relative min-h-0 flex-1 {stale ? 'opacity-60' : ''}" bind:this={pane}>
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    fitView
    minZoom={0.05}
    nodesDraggable={false}
    elementsSelectable={false}
    onlyRenderVisibleElements
    onnodeclick={({ node }) => {
      if (node.data.ghost) return;
      selected.id = node.data.nodeId as number;
    }}
    onpaneclick={() => {
      if (deselectOnPaneClick) selected.id = null;
    }}
  >
    <ViewportAnchor {anchor} {pane} />
    <Background />
    <Controls showLock={false} />
  </SvelteFlow>
</div>
