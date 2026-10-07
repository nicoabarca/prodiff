<script lang="ts">
  import { built } from "$lib/tree/state/build.svelte";
  import { selected } from "$lib/tree/state/tree.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import JsonInspector from "$lib/devtools/components/json-inspector.svelte";
  import { findNode, treeSummary } from "$lib/devtools/tree/utils/inspect";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  const node = $derived(findNode(tree, selected.id));

  const tabs = $derived([
    { value: "tree", label: "Tree", name: "tree", data: tree, openDepth: 1 },
    {
      value: "node",
      label: node ? `Node #${node.id}` : "Node",
      name: `node #${node?.id}`,
      data: node,
      openDepth: 2,
      disabled: node === null
    }
  ]);

  // Exposes the payload to the devtools console as `window.__tree`.
  $effect(() => {
    (window as unknown as { __tree?: ResponseDirectedTree }).__tree = tree;
  });
</script>

<JsonInspector
  id="tree-inspector"
  title="Tree JSON inspector"
  {tabs}
  summary={treeSummary(tree, built.key)}
/>
