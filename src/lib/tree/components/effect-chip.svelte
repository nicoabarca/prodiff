<script lang="ts">
  /**
   * One attribute's Significance Test, said in one word. Without `tooltip` it
   * renders the bare badge, for placing inside another control.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Test } from "$lib/analysis/types";
  import { cn } from "$lib/utils";
  import { effectBand, effectStep } from "$lib/tree/utils/effect";
  import { testLine } from "$lib/tree/utils/verdict";

  let {
    test,
    tooltip = true,
    class: className
  }: { test: Test | null | undefined; tooltip?: boolean; class?: string } = $props();

  const band = $derived(test ? effectBand(test.effectSize) : null);
  const label = $derived(!test ? "" : !test.significant ? "no difference" : (band ?? ""));
  // A failed test has no magnitude to place on the ramp, so it stays neutral.
  const step = $derived(test?.significant ? effectStep(test.effectSize) : null);
</script>

{#snippet chip()}
  {#if step}
    <Badge
      class={cn("border-(--ink)/20 bg-(--fill) text-(--ink)", className)}
      style="--fill:var(--effect-{step});--ink:var(--effect-{step}-foreground)"
    >
      {label}
    </Badge>
  {:else}
    <Badge variant="secondary" class={className}>{label}</Badge>
  {/if}
{/snippet}

{#if test}
  {#if tooltip}
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {@render chip()}
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-64 text-[0.6875rem]">
          {testLine(test, comparedGroups())}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {:else}
    {@render chip()}
  {/if}
{/if}
