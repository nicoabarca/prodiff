<script lang="ts">
  /**
   * Prototype A: the selected activity's Significance Tests, read like the tree's
   * panel. Its own attributes plus the Waiting Time on each edge into it, split by
   * Standing and strongest first.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import TestRow from "$lib/dfg/components/prototypes/test-row.svelte";
  import { focusOn, isFocused } from "$lib/dfg/state/prototypes/focus.svelte";
  import { selected } from "$lib/dfg/state/view.svelte";
  import type { FaceGroup } from "$lib/dfg/types";
  import { membership } from "$lib/dfg/utils/face";
  import { atNode, split, type Finding } from "$lib/dfg/utils/prototypes/findings";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Standing } from "$lib/tree/types";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import X from "@lucide/svelte/icons/x";

  let {
    simplified,
    groups,
    findings,
    totals,
    onClose
  }: {
    simplified: Simplified;
    groups: FaceGroup[];
    findings: Finding[];
    totals: Record<string, number>;
    onClose: () => void;
  } = $props();

  const node = $derived(simplified.nodes.find((one) => one.id === selected.id) ?? null);
  const here = $derived(node ? atNode(findings, node.id) : null);
  const ranked = $derived(split(here ? [...here.own, ...here.into] : []));
  const owner = $derived(node ? groups.find((g) => g.id === membership(node.counts, groups)) : null);

  const reach = $derived(
    groups.map((group) => {
      const count = node?.counts[group.id]?.cases ?? 0;
      const total = totals[group.id] ?? 0;
      return { group, count, share: total > 0 ? Math.round((count / total) * 100) : 0 };
    })
  );

  const tabs: { value: Standing; label: string; empty: string }[] = [
    {
      value: "finding",
      label: "Differences",
      empty: "No attribute differs meaningfully between the groups at this activity."
    },
    { value: "weak", label: "No difference", empty: "Every tested attribute differs here." },
    { value: "untested", label: "Not tested", empty: "Every attribute was tested here." }
  ];

  let tab = $derived.by((): Standing => {
    void node;
    return "finding";
  });
</script>

<aside class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col border-l">
  {#if !node || !here}
    <div class="flex items-center justify-end p-2">
      <Button variant="ghost" size="icon" aria-label="Hide tests" onclick={onClose}>
        <X />
      </Button>
    </div>
    <div
      class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 pt-0"
    >
      <MousePointerClick class="size-5" aria-hidden="true" />
      <p class="text-center text-xs">Select an activity to test where the groups differ.</p>
    </div>
  {:else}
    <div class="border-border flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3.5 pb-3">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <span class="text-muted-foreground text-[0.625rem]">
            {node.kind === "activity" ? "Activity" : node.kind === "start" ? "Start" : "End"}
          </span>
          <h2 class="text-[0.9375rem] leading-tight font-semibold text-pretty">{node.label}</h2>
          <Badge variant="secondary" class="text-[0.6875rem]">
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background:{owner ? colorVar(owner.color) : 'var(--muted-foreground)'}"
              aria-hidden="true"
            ></span>
            {owner ? `${owner.name} only` : "Every group"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          class="-mt-1 -mr-2"
          aria-label="Hide tests"
          onclick={onClose}
        >
          <X />
        </Button>
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
          Share of each group's cases that reach this activity
        </span>
      </div>
    </div>

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
      <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
           content, so without it the scroll root grows past the panel. -->
      <ScrollArea.Root class="min-h-0 flex-1">
        {#each tabs as { value, empty } (value)}
          <Tabs.Content {value}>
            {#each ranked[value] as finding, i (finding.key)}
              <TestRow
                {finding}
                showPlace={finding.place.kind === "edge"}
                focused={isFocused(finding.place)}
                open={value === "finding" && i === 0}
                onLocate={finding.place.kind === "edge"
                  ? () => focusOn(finding.place)
                  : undefined}
              />
            {:else}
              <p class="text-muted-foreground px-4 py-3.5 text-xs">{empty}</p>
            {/each}
          </Tabs.Content>
        {/each}
      </ScrollArea.Root>
    </Tabs.Root>
  {/if}
</aside>
