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
  import { effectBand } from "$lib/tree/utils/effect";
  import { testLine } from "$lib/tree/utils/verdict";

  let {
    test,
    tooltip = true,
    class: className
  }: { test: Test | null | undefined; tooltip?: boolean; class?: string } = $props();

  const band = $derived(test ? effectBand(test.effectSize) : null);
  const label = $derived(!test ? "" : !test.significant ? "not enough evidence" : (band ?? ""));
  // A failed test stays neutral.
  const significant = $derived(test?.significant ?? false);
</script>

{#snippet chip()}
  {#if significant}
    <Badge
      class={cn("border-(--ink)/20 bg-(--fill) text-(--ink)", className)}
      style="--fill:var(--effect);--ink:var(--effect-foreground)"
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
