<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import SummaryCompare from "$lib/components/projects/tree/summary-compare.svelte";
  import { formatNumber } from "$lib/format";
  import {
    isDurationAttribute,
    membership,
    pathTo,
    TRANSITION_TIME,
    type AttributeBlock,
    type DirectedTree,
    type Test
  } from "$lib/tree";
  import { Button } from "$lib/components/ui/button/index.js";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import X from "@lucide/svelte/icons/x";

  let {
    tree,
    nodeId,
    onClose
  }: { tree: DirectedTree; nodeId: number | null; onClose: () => void } = $props();

  const node = $derived(nodeId === null ? null : (tree.nodes.find((n) => n.id === nodeId) ?? null));
  const path = $derived(node ? pathTo(tree, node.id) : []);

  /** Every attribute at this node, Transition Time last as the edge into it. */
  const blocks = $derived.by((): [string, AttributeBlock][] => {
    if (!node) return [];
    const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
    if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
    return entries;
  });

  function testLine(test: Test): string {
    const name = test.test === "chi2" ? "Chi-square" : "Mann-Whitney U";
    const direction =
      test.direction === "aHigher"
        ? " · A higher"
        : test.direction === "bHigher"
          ? " · B higher"
          : "";
    const p = test.pValue < 0.001 ? test.pValue.toExponential(1) : test.pValue.toFixed(3);
    return `${name} · p = ${p} · effect ${test.effectSize.toFixed(2)}${direction}`;
  }

  /** Why a block carries no Significance Test, in the user's terms. */
  function untestable(block: AttributeBlock): string {
    if (!tree.groupB) return "One-group mode — nothing to compare against.";
    const n = (side: "groupA" | "groupB") => block[side]?.n ?? 0;
    if (n("groupA") < 5 || n("groupB") < 5) {
      return `Too few cases to test — Group A: ${n("groupA")}, Group B: ${n("groupB")} (minimum 5 each).`;
    }
    return "Not enough distinct values to compare.";
  }
</script>

<aside class="border-border bg-sidebar flex w-96 shrink-0 flex-col border-l">
  {#if !node}
    <div class="flex items-center justify-end p-2">
      <Button variant="ghost" size="icon" aria-label="Hide details" onclick={onClose}>
        <X />
      </Button>
    </div>
    <div class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 pt-0">
      <MousePointerClick class="size-5" aria-hidden="true" />
      <p class="text-center text-xs">Select a node to compare its aggregates.</p>
    </div>
  {:else}
    <div class="border-border flex flex-col gap-2 border-b p-4">
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-sm font-semibold">{node.label}</h2>
        <div class="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">
            {membership(node) === "shared"
              ? "Both groups"
              : `Group ${membership(node).toUpperCase()} only`}
          </Badge>
          <Button variant="ghost" size="icon" aria-label="Hide details" onclick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <p class="text-muted-foreground font-mono text-[0.6875rem]">
        A {formatNumber(node.groupACases)} · B {formatNumber(node.groupBCases)} cases
      </p>
      <p class="text-muted-foreground truncate text-[0.625rem]" title={path.map((n) => n.label).join(" → ")}>
        {path.map((n) => n.label).join(" → ")}
      </p>
    </div>

    <ScrollArea.Root class="flex-1">
      <div class="flex flex-col gap-4 p-4">
        {#if node.comovement.length > 0}
          <div class="flex flex-col gap-1.5">
            <h3 class="text-xs font-semibold">Attribute co-movement</h3>
            {#each node.comovement as pair (pair.attributeX + pair.attributeY)}
              <div class="flex items-center gap-2 text-[0.6875rem]">
                <Badge variant={pair.relationship === "divergent" ? "destructive" : "secondary"}>
                  {pair.relationship}
                </Badge>
                <span class="truncate">{pair.attributeX} · {pair.attributeY}</span>
              </div>
            {/each}
            <p class="text-muted-foreground text-[0.625rem]">
              Divergent means the two attributes shift opposite ways between the groups.
            </p>
          </div>
          <Separator />
        {/if}

        {#each blocks as [name, block] (name)}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold">{name}</h3>
              {#if block.test?.significant}
                <Badge>significant</Badge>
              {/if}
            </div>
            {#if name === TRANSITION_TIME}
              <p class="text-muted-foreground text-[0.625rem]">
                Time on the edge from {path.at(-2)?.label ?? "Start"}, measured as
                {tree.transitionTimeBasis === "startComplete"
                  ? "start of this activity − completion of the previous one."
                  : "completion of this activity − completion of the previous one."}
              </p>
            {/if}
            <SummaryCompare
              groupA={block.groupA}
              groupB={block.groupB}
              duration={isDurationAttribute(name)}
            />
            {#if block.test}
              <p class="text-muted-foreground font-mono text-[0.625rem]">{testLine(block.test)}</p>
            {:else}
              <p class="text-muted-foreground text-[0.625rem]">{untestable(block)}</p>
            {/if}
          </div>
          <Separator />
        {:else}
          <p class="text-muted-foreground text-xs">
            No attributes selected — pick some in Build settings and rebuild.
          </p>
        {/each}
      </div>
    </ScrollArea.Root>
  {/if}
</aside>
