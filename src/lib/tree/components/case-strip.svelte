<script lang="ts">
  /**
   * The case attributes as one row of chips above the tree or the graph: each
   * names the attribute, its headline and its magnitude, and opens its chart.
   * Measured once per case across each Group, so no node changes them.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import TrimmedNote from "$lib/groups/components/trimmed-note.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { AttributeBlock, Summary } from "$lib/analysis/types";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { effectBand, effectStep } from "$lib/tree/utils/effect";
  import { headline, testLine } from "$lib/tree/utils/verdict";
  import { cn } from "$lib/utils";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Info from "@lucide/svelte/icons/info";

  let {
    caseLevel,
    groupIds,
    cappedByCeiling = false
  }: {
    caseLevel: Record<string, AttributeBlock>;
    groupIds: string[];
    cappedByCeiling?: boolean;
  } = $props();

  const groups = $derived(comparedGroups());
  const comparing = $derived(groupIds.length > 1);

  const attributes = $derived(
    Object.entries(caseLevel)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([name, block]) => {
        const summaries: Record<string, Summary | null> = Object.fromEntries(
          groupIds.map((id) => [id, block.summaries[id] ?? null])
        );
        return {
          name,
          summaries,
          test: block.test,
          headline: headline(summaries, comparing ? groups : groups.slice(0, 1), false)
        };
      })
  );

  const significant = $derived(attributes.filter((a) => a.test?.significant));
  const strongest = $derived(
    significant.length > 0
      ? effectBand(Math.max(...significant.map((a) => a.test!.effectSize)))
      : null
  );

  let expanded = $state(true);

  const hasContent = $derived(cappedByCeiling || attributes.length > 0);
</script>

{#if hasContent}
  <div
    class="border-border bg-background flex h-10 shrink-0 items-center gap-2 border-b pr-3 pl-2.5"
  >
    {#if attributes.length > 0}
      <Button
        variant="ghost"
        size="xs"
        class="font-semibold"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <ChevronDown
          data-icon="inline-start"
          class={cn("text-muted-foreground transition-transform", !expanded && "-rotate-90")}
        />
        Case attributes
      </Button>

      {#if expanded}
        <div
          class="flex min-w-0 flex-1 [scrollbar-width:thin] items-center gap-1.5 overflow-x-auto"
        >
          {#each attributes as attribute (attribute.name)}
            <Popover.Root>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="xs"
                    class="h-6.5 gap-1.5 pr-1 pl-2"
                    title={attribute.test ? testLine(attribute.test, groups) : undefined}
                  >
                    <span class="text-[0.6875rem] font-semibold">
                      <AttributeName name={attribute.name} />
                    </span>
                    <span class="text-muted-foreground text-[0.625rem] font-normal tabular-nums">
                      {attribute.headline}
                    </span>
                    <EffectChip
                      test={attribute.test}
                      tooltip={false}
                      class="h-4.5 px-1.5 text-[0.625rem]"
                    />
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content align="start" class="w-96">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold"><AttributeName name={attribute.name} /></span>
                  <EffectChip test={attribute.test} tooltip={false} />
                </div>
                <SummaryCompare summaries={attribute.summaries} compare={comparing} />
                <TrimmedNote {groups} attribute={attribute.name} />
                {#if attribute.test}
                  <p
                    class="border-border text-muted-foreground border-t pt-1.5 font-mono text-[0.625rem] text-pretty"
                  >
                    {testLine(attribute.test, groups)}
                  </p>
                {/if}
              </Popover.Content>
            </Popover.Root>
          {/each}
        </div>
      {:else}
        <span class="text-muted-foreground text-[0.6875rem] whitespace-nowrap">
          {#if comparing}
            {significant.length} of {attributes.length} differ
            {#if strongest}· strongest {strongest}{/if}
          {:else}
            {attributes.length} measured
          {/if}
        </span>
        <span class="flex gap-0.5" aria-hidden="true">
          {#each attributes as attribute (attribute.name)}
            {@const step = attribute.test?.significant ? effectStep(attribute.test.effectSize) : 0}
            {#if step}
              <span
                class="size-2 rounded-full border border-(--ink)/30 bg-(--fill)"
                style="--fill:var(--effect-{step});--ink:var(--effect-{step}-foreground)"
                title={attribute.name}
              ></span>
            {:else}
              <span class="border-border bg-muted size-2 rounded-full border" title={attribute.name}
              ></span>
            {/if}
          {/each}
        </span>
        <span class="flex-1"></span>
      {/if}
    {:else}
      <span class="flex-1"></span>
    {/if}

    {#if cappedByCeiling}
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger>
            <Badge variant="secondary" class="h-6 cursor-help">
              <Info data-icon="inline-start" />
              Rarest variants left out
            </Badge>
          </Tooltip.Trigger>
          <Tooltip.Content class="max-w-64 text-[0.6875rem]">
            The log has more Variants than a build ships. The rarest ones are not in this tree at
            all, whatever the slider says.
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}
  </div>
{/if}
