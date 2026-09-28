<script lang="ts">
  import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { AttributeBlock } from "$lib/analysis/types";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import type { Standing } from "$lib/tree/types";
  import { effectBand, rankedBlocks } from "$lib/tree/utils/effect";
  import { higherGroup, testLine, untestable, verdict } from "$lib/tree/utils/verdict";
  import { TRANSITION_TIME, isDurationAttribute } from "$lib/analysis/attributes";
  import { membership, pathTo, visibleNodes } from "$lib/tree/utils/tree";
  import { selectedVariants, view } from "$lib/tree/state/tree.svelte";
  import { cn } from "$lib/utils";
  import { SvelteSet } from "svelte/reactivity";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import Split from "@lucide/svelte/icons/split";
  import X from "@lucide/svelte/icons/x";

  let {
    tree,
    nodeId,
    distributionsHref,
    onClose,
    onCompare,
    onOpenBuildSettings
  }: {
    tree: ResponseDirectedTree;
    nodeId: number | null;
    distributionsHref: string;
    onClose: () => void;
    onCompare: () => void;
    onOpenBuildSettings: () => void;
  } = $props();

  const node = $derived(nodeId === null ? null : (tree.nodes.find((n) => n.id === nodeId) ?? null));
  const path = $derived(node ? pathTo(tree, node.id) : []);
  const compare = $derived(tree.groups.length > 1);
  /** Restricted to the surviving Variants: raw totals over-count. */
  const cases = $derived(
    node ? (visibleNodes(tree, view, selectedVariants()).cases.get(node.id) ?? {}) : null
  );

  const groups = $derived(comparedGroups());
  const drawn = $derived(compare ? groups : groups.slice(0, 1));
  const ids = $derived(tree.groups.map((group) => group.id));

  const member = $derived(node ? membership(node, ids) : "shared");
  const memberGroup = $derived(groups.find((group) => group.id === member) ?? null);

  /** Each Group's cases at this node, as a share of all its cases in the tree. */
  const reach = $derived(
    drawn.map((group) => {
      const count = cases?.[group.id] ?? 0;
      const total = tree.groups.find((g) => g.id === group.id)?.caseCount ?? 0;
      return { group, count, share: total > 0 ? Math.round((count / total) * 100) : 0 };
    })
  );

  /**
   * Attributes strongest first, split by Standing. At a few thousand cases per
   * Group nearly every test is significant.
   */
  const ranked = $derived(
    node
      ? rankedBlocks(node)
      : { finding: [], weak: [], untested: [] as [string, AttributeBlock][] }
  );

  /** One-Group mode has no differences to rank: attributes stay in build order. */
  const flat = $derived.by((): [string, AttributeBlock][] => {
    if (!node) return [];
    const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
    if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
    return entries;
  });

  const tabs: { value: Standing; label: string; empty: string }[] = [
    {
      value: "finding",
      label: "Differences",
      empty: "No attribute differs meaningfully between the groups at this node."
    },
    { value: "weak", label: "No difference", empty: "Every tested attribute differs here." },
    { value: "untested", label: "Not tested", empty: "Every attribute was tested here." }
  ];

  /** Attributes in a divergent pair: they shift opposite ways between the Groups. */
  const divergent = $derived(
    new Set(
      (node?.comovement ?? [])
        .filter((pair) => pair.relationship === "divergent")
        .flatMap((pair) => [pair.attributeX, pair.attributeY])
    )
  );

  // A new node opens on its strongest finding.
  let tab = $derived.by((): Standing => {
    void node;
    return "finding";
  });
  const expanded = $derived(new SvelteSet(ranked.finding.slice(0, 1).map(([name]) => name)));

  function toggle(name: string, open: boolean) {
    if (open) expanded.add(name);
    else expanded.delete(name);
  }
</script>

{#snippet row(name: string, block: AttributeBlock)}
  {@const duration = isDurationAttribute(name)}
  {@const higher = higherGroup(block.test, groups)}
  {@const open = expanded.has(name)}
  <Collapsible.Root
    {open}
    onOpenChange={(value) => toggle(name, value)}
    class={cn("border-border border-b", open && "bg-background")}
  >
    <Collapsible.Trigger
      class="hover:bg-muted grid w-full cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 pr-4 pl-3 text-left"
    >
      <ChevronRight
        class={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-90")}
        aria-hidden="true"
      />
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="flex items-center gap-1.25 text-xs font-semibold whitespace-nowrap">
          <span class="truncate" title={attributeLabel(name)}><AttributeName {name} /></span>
          {#if divergent.has(name)}
            <Split
              class="text-destructive size-3 shrink-0"
              aria-label="Moves opposite to another attribute here"
            />
          {/if}
        </span>
        <span
          class="text-muted-foreground flex items-center gap-1.25 text-[0.625rem] whitespace-nowrap"
        >
          {#if higher}
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background:{colorVar(higher.color)}"
              aria-hidden="true"
            ></span>
          {/if}
          <span class="truncate">{verdict(block, drawn, duration)}</span>
        </span>
      </span>
      {#if compare && block.test}
        <span class="flex items-center gap-2">
          <EffectMeter test={block.test} />
          <EffectChip test={block.test} tooltip={false} />
        </span>
      {:else}
        <span></span>
      {/if}
    </Collapsible.Trigger>
    <Collapsible.Content class="flex flex-col gap-2 pr-4 pb-3.5 pl-8.5">
      {#if name === TRANSITION_TIME}
        <p class="text-muted-foreground text-[0.625rem]">
          Time on the edge from {path.at(-2)?.label ?? "Start"}, measured as
          {tree.transitionTimeBasis === "startComplete"
            ? "start of this activity − completion of the previous one."
            : "completion of this activity − completion of the previous one."}
        </p>
      {/if}
      <SummaryCompare summaries={block.summaries} {compare} {duration} />
      {#if !block.test}
        {#if compare}
          <p class="text-muted-foreground text-[0.625rem]">{untestable(block, drawn)}</p>
        {/if}
      {:else}
        {#if block.test.significant && effectBand(block.test.effectSize) === "negligible"}
          <p class="text-muted-foreground text-[0.625rem]">
            The test is confident this gap is real, but it is too small to act on.
          </p>
        {/if}
        <p class="text-muted-foreground font-mono text-[0.625rem] text-pretty">
          {testLine(block.test, groups)}
        </p>
      {/if}
    </Collapsible.Content>
  </Collapsible.Root>
{/snippet}

<aside
  class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col border-l"
  data-tour="tree-detail-panel"
>
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
    <div class="border-border flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3.5 pb-3">
      <Breadcrumb.Root>
        <Breadcrumb.List
          class="flex-nowrap gap-1 overflow-hidden text-[0.625rem] whitespace-nowrap"
        >
          {#each path as step, i (step.id)}
            {#if i > 0}
              <Breadcrumb.Separator class="[&>svg]:size-2.5" />
            {/if}
            <Breadcrumb.Item class={cn("min-w-0", i === path.length - 1 && "shrink-0")}>
              {#if i === path.length - 1}
                <Breadcrumb.Page class="text-muted-foreground truncate text-[0.625rem]">
                  {step.label}
                </Breadcrumb.Page>
              {:else}
                <span class="truncate" title={step.label}>{step.label}</span>
              {/if}
            </Breadcrumb.Item>
          {/each}
        </Breadcrumb.List>
      </Breadcrumb.Root>

      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <h2 class="text-[0.9375rem] leading-tight font-semibold text-pretty">{node.label}</h2>
          <Badge variant="secondary" class="text-[0.6875rem]">
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background:{memberGroup
                ? colorVar(memberGroup.color)
                : 'var(--muted-foreground)'}"
              aria-hidden="true"
            ></span>
            {memberGroup ? `${memberGroup.name} only` : "Every group"}
          </Badge>
        </div>
        <div class="-mt-1 -mr-2 flex shrink-0 items-center gap-0.5">
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground"
                  aria-label="How to read this"
                  {...props}
                >
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
          <Button variant="ghost" size="icon-sm" aria-label="Hide details" onclick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-1.25">
        {#each reach as { group, count, share } (group.id)}
          <div class="grid grid-cols-[5.75rem_minmax(0,1fr)_6.75rem] items-center gap-2">
            <span class="flex items-center gap-1.25 truncate text-[0.6875rem] font-medium">
              <span
                class="size-2 shrink-0 rounded-full"
                style="background:{colorVar(group.color)}"
                aria-hidden="true"
              ></span>
              <span class="truncate">{group.name}</span>
            </span>
            <span class="bg-muted relative h-1.5">
              <span
                class="absolute inset-y-0 left-0"
                style="width:{share}%;background:{colorVar(group.color)}"
              ></span>
            </span>
            <span
              class="text-muted-foreground text-right font-mono text-[0.625rem] whitespace-nowrap"
            >
              {formatNumber(count)} · {share}%
            </span>
          </div>
        {/each}
        <span class="text-muted-foreground text-[0.625rem]">
          Share of each group's cases that reach this node
        </span>
      </div>
    </div>

    {#if flat.length === 0}
      <div class="text-muted-foreground flex flex-1 flex-col items-start gap-3 px-4 py-3.5 text-xs">
        <p>No attributes selected. Choose attributes to test differences in the tree.</p>
        <Button variant="outline" size="sm" onclick={onOpenBuildSettings}>
          Open Build settings
        </Button>
      </div>
    {:else if !compare}
      <div class="border-border flex shrink-0 flex-col items-start gap-2.5 border-b px-4 py-3">
        <p class="text-muted-foreground text-xs">
          One-group mode: the tree only shows this group's paths, with nothing to compare against.
        </p>
        <Button size="sm" onclick={onCompare}>Choose a second group</Button>
      </div>
      <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
           content, so without it the scroll root grows past the panel. -->
      <ScrollArea.Root class="min-h-0 flex-1">
        {#each flat as [name, block] (name)}
          {@render row(name, block)}
        {/each}
      </ScrollArea.Root>
    {:else}
      <Tabs.Root
        value={tab}
        onValueChange={(value) => (tab = value as Standing)}
        class="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div class="border-border flex h-9 shrink-0 items-stretch border-b px-4">
          <Tabs.List variant="line" class="h-full gap-1 p-0">
            {#each tabs as { value, label } (value)}
              <Tabs.Trigger {value} class="h-full flex-none px-1.5 text-[0.6875rem] after:bottom-0">
                {label}
                <span class="text-muted-foreground font-mono text-[0.625rem]">
                  {ranked[value].length}
                </span>
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </div>
        <ScrollArea.Root class="min-h-0 flex-1">
          {#each tabs as { value, empty } (value)}
            <Tabs.Content {value}>
              {#each ranked[value] as [name, block] (name)}
                {@render row(name, block)}
              {:else}
                <p class="text-muted-foreground px-4 py-3.5 text-xs">{empty}</p>
              {/each}
            </Tabs.Content>
          {/each}

          {#if node.comovement.length > 0}
            <div class="flex flex-col gap-2 px-4 py-3.5">
              <h3 class="text-muted-foreground text-[0.6875rem] font-semibold">Co-movement</h3>
              {#each node.comovement as pair (pair.attributeX + pair.attributeY)}
                <div class="flex items-center gap-2 text-[0.6875rem]">
                  <Split
                    class={cn(
                      "size-3.5 shrink-0",
                      pair.relationship === "divergent"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  <span class="truncate font-medium">{attributeLabel(pair.attributeX)}</span>
                  <span class="text-muted-foreground">⇄</span>
                  <span class="truncate font-medium">{attributeLabel(pair.attributeY)}</span>
                  <Badge
                    variant={pair.relationship === "divergent" ? "destructive" : "secondary"}
                    class="ml-auto text-[0.6875rem]"
                  >
                    {pair.relationship}
                  </Badge>
                </div>
              {/each}
              <p class="text-muted-foreground text-[0.625rem]">
                Divergent attributes shift opposite ways between the groups; concordant ones shift
                the same way.
              </p>
            </div>
          {/if}
        </ScrollArea.Root>
      </Tabs.Root>
    {/if}

    <div class="border-border flex shrink-0 gap-2 border-t px-4 py-2.5">
      <Button
        variant="outline"
        size="sm"
        class="flex-1"
        data-tour="open-distributions"
        href={distributionsHref}
      >
        <ChartColumn data-icon="inline-start" />
        Open in Distributions
      </Button>
    </div>
  {/if}
</aside>
