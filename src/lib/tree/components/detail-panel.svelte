<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { formatNumber } from "$lib/format";
  import { comparedGroups } from "$lib/tree/state/tree.svelte";
  import type { AttributeBlock } from "$lib/analysis/types";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { effectBand, rankedBlocks } from "$lib/tree/utils/effect";
  import { TRANSITION_TIME, isDurationAttribute } from "$lib/tree/utils/settings";
  import { membership, pathTo, visibleNodes } from "$lib/tree/utils/tree";
  import { selectedVariants, view } from "$lib/tree/state/tree.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import X from "@lucide/svelte/icons/x";

  let {
    tree,
    nodeId,
    onClose
  }: { tree: ResponseDirectedTree; nodeId: number | null; onClose: () => void } = $props();

  const node = $derived(nodeId === null ? null : (tree.nodes.find((n) => n.id === nodeId) ?? null));
  const path = $derived(node ? pathTo(tree, node.id) : []);
  const compare = $derived(tree.groups.length > 1);
  /** Restricted to the surviving Variants: raw totals over-count. */
  const cases = $derived(
    node ? (visibleNodes(tree, view, selectedVariants()).cases.get(node.id) ?? {}) : null
  );

  const groups = $derived(comparedGroups());
  const ids = $derived(tree.groups.map((group) => group.id));

  /**
   * Attributes strongest first, with the negligible and untestable ones folded
   * away. At a few thousand cases per Group nearly every test is significant.
   */
  const ranked = $derived(
    node
      ? rankedBlocks(node)
      : { finding: [], weak: [], untested: [] as [string, AttributeBlock][] }
  );

  /**
   * One-Group mode has no differences to rank: attributes stay in build order
   * and all of them are shown.
   */
  const flat = $derived.by((): [string, AttributeBlock][] => {
    if (!node) return [];
    const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
    if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
    return entries;
  });

  /** Why a block carries no Significance Test, in the user's terms. */
  function untestable(block: AttributeBlock): string {
    if (!compare) return "One-group mode: nothing to compare against.";
    const counted = groups.map((group) => ({
      name: group.name,
      n: block.summaries[group.id]?.n ?? 0
    }));
    if (counted.some((group) => group.n < 5)) {
      const listed = counted.map((group) => `${group.name}: ${group.n}`).join(", ");
      return `Too few cases to test. ${listed} (minimum 5 each).`;
    }
    return "Not enough distinct values to compare.";
  }
</script>

{#snippet attribute(name: string, block: AttributeBlock)}
  <div class="border-border flex flex-col gap-2 border-b px-4 py-3.5">
    <div class="flex items-center justify-between gap-2">
      <h3 class="truncate text-xs font-semibold" title={name}>{name}</h3>
      <EffectChip test={block.test} />
    </div>

    {#if name === TRANSITION_TIME}
      <p class="text-muted-foreground text-[0.625rem]">
        Time on the edge from {path.at(-2)?.label ?? "Start"}, measured as
        {tree.transitionTimeBasis === "startComplete"
          ? "start of this activity − completion of the previous one."
          : "completion of this activity − completion of the previous one."}
      </p>
    {/if}

    <SummaryCompare summaries={block.summaries} {compare} duration={isDurationAttribute(name)} />

    {#if !block.test}
      {#if compare}
        <p class="text-muted-foreground text-[0.625rem]">{untestable(block)}</p>
      {/if}
    {:else if block.test.significant && effectBand(block.test.effectSize) === "negligible"}
      <p class="text-muted-foreground text-[0.625rem]">
        The test is confident this gap is real, but it is too small to act on.
      </p>
    {/if}
  </div>
{/snippet}

<aside class="border-border bg-sidebar flex w-[28rem] shrink-0 flex-col border-l">
  {#if !node}
    <div class="flex items-center justify-end p-2">
      <Button variant="ghost" size="icon" aria-label="Hide details" onclick={onClose}>
        <X />
      </Button>
    </div>
    <div
      class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 pt-0"
    >
      <MousePointerClick class="size-5" aria-hidden="true" />
      <p class="text-center text-xs">Select a node to compare its aggregates.</p>
    </div>
  {:else}
    <div class="border-border flex shrink-0 flex-col gap-2 border-b p-4">
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-sm font-semibold">{node.label}</h2>
        <div class="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">
            {membership(node, ids) === "shared"
              ? "Every group"
              : `${groups.find((group) => group?.id === membership(node, ids))?.name ?? "Group"} only`}
          </Badge>
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button variant="ghost" size="icon" aria-label="How to read this" {...props}>
                  <CircleQuestionMark />
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="flex w-80 flex-col gap-2.5 text-[0.6875rem]" align="end">
              <p class="text-xs font-semibold">How to read this</p>
              <p>
                Bars show how much more common a value is in one group than the other, in percentage
                points. Longer means a bigger gap. Numeric attributes show the two groups' quartiles
                instead, with the median difference stated above them.
              </p>
              <p>
                <span class="font-semibold">Magnitude</span> ranks the whole attribute: negligible below
                0.10, small below 0.30, moderate below 0.50, large at 0.50 and up.
              </p>
              <div class="flex items-center gap-1">
                {#each [1, 2, 3, 4] as step (step)}
                  <span class="h-2 flex-1" style="background:var(--effect-{step})"></span>
                {/each}
              </div>
              <p class="text-muted-foreground flex justify-between text-[0.625rem]">
                <span>negligible</span>
                <span>large</span>
              </p>
              <p>
                <span class="font-semibold">Divergent</span> co-movement means two attributes shift opposite
                ways between the groups.
              </p>
            </Popover.Content>
          </Popover.Root>
          <Button variant="ghost" size="icon" aria-label="Hide details" onclick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <p class="text-muted-foreground font-mono text-[0.6875rem]">
        {groups.map((group) => `${group.name} ${formatNumber(cases?.[group.id] ?? 0)}`).join(" · ")} cases
      </p>
      <p
        class="text-muted-foreground truncate text-[0.625rem]"
        title={path.map((n) => n.label).join(" → ")}
      >
        {path.map((n) => n.label).join(" → ")}
      </p>
    </div>

    <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
         content, so without it the scroll root grows past the panel. -->
    <ScrollArea.Root class="min-h-0 flex-1">
      <div class="flex flex-col">
        {#if node.comovement.length > 0}
          <div class="border-border flex flex-col gap-1.5 border-b px-4 py-3.5">
            <h3 class="text-xs font-semibold">Attribute co-movement</h3>
            <Table.Root class="text-[0.6875rem]">
              <Table.Header>
                <Table.Row class="hover:bg-transparent">
                  <Table.Head class="h-6 px-0 text-[0.6875rem]">movement</Table.Head>
                  <Table.Head class="h-6 px-2"></Table.Head>
                  <Table.Head class="h-6 px-0"></Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each node.comovement as pair (pair.attributeX + pair.attributeY)}
                  <Table.Row class="hover:bg-transparent">
                    <Table.Cell class="px-0 py-1">
                      <Badge variant="secondary">{pair.relationship}</Badge>
                    </Table.Cell>
                    <Table.Cell class="truncate px-2 py-1">{pair.attributeX}</Table.Cell>
                    <Table.Cell class="truncate px-0 py-1">{pair.attributeY}</Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        {/if}

        {#if !compare}
          <p class="text-muted-foreground border-border border-b px-4 py-3 text-xs">
            One group. These are its distributions, with nothing to compare them against.
          </p>
          {#each flat as [name, block] (name)}
            {@render attribute(name, block)}
          {/each}
        {:else}
          {#each ranked.finding as [name, block] (name)}
            {@render attribute(name, block)}
          {/each}

          {#if ranked.finding.length === 0 && flat.length > 0}
            <p class="text-muted-foreground px-4 py-3.5 text-xs">
              No attribute differs meaningfully between the groups at this node.
            </p>
          {/if}

          {#each [["No meaningful difference", ranked.weak], ["Could not be tested", ranked.untested]] as const as [title, blocks] (title)}
            {#if blocks.length > 0}
              <details class="border-border border-b">
                <summary
                  class="text-muted-foreground hover:text-foreground cursor-pointer px-4 py-3 text-xs"
                >
                  {title} ({blocks.length})
                </summary>
                {#each blocks as [name, block] (name)}
                  {@render attribute(name, block)}
                {/each}
              </details>
            {/if}
          {/each}
        {/if}

        {#if flat.length === 0}
          <p class="text-muted-foreground px-4 py-3.5 text-xs">
            No attributes selected. Pick some in Build settings and rebuild.
          </p>
        {/if}
      </div>
    </ScrollArea.Root>
  {/if}
</aside>
