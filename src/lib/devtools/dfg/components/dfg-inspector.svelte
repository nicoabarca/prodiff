<script lang="ts">
  import { built } from "$lib/dfg/state/dfg.svelte";
  import { selected } from "$lib/dfg/state/view.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import JsonInspector from "$lib/devtools/components/json-inspector.svelte";
  import { dfgSummary, findNode, plainSimplified } from "$lib/devtools/dfg/utils/inspect";

  let { graph, simplified }: { graph: ResponseDfg; simplified: Simplified } = $props();

  const node = $derived(findNode(graph, selected.id));
  const drawn = $derived(plainSimplified(simplified));

  const tabs = $derived([
    { value: "graph", label: "Graph", name: "graph", data: graph, openDepth: 1 },
    { value: "simplified", label: "Simplified", name: "simplified", data: drawn, openDepth: 1 },
    {
      value: "node",
      label: node ? `Node #${node.node.id}` : "Node",
      name: `node #${node?.node.id}`,
      data: node,
      openDepth: 2,
      disabled: node === null
    }
  ]);

  // Exposes the payload and its simplification to the devtools console as
  // `window.__dfg` and `window.__dfgSimplified`.
  $effect(() => {
    const target = window as unknown as { __dfg?: ResponseDfg; __dfgSimplified?: Simplified };
    target.__dfg = graph;
    target.__dfgSimplified = simplified;
  });
</script>

<JsonInspector
  id="dfg-inspector"
  title="DFG JSON inspector"
  {tabs}
  summary={dfgSummary(graph, built.key)}
/>
