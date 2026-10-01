<script lang="ts">
  /**
   * The graph's settings as a row of fields: what is compared, which Variants,
   * which attributes are tested, whether it is split, and how it is drawn.
   */
  import CompareField from "$lib/groups/components/compare-field.svelte";
  import Settings from "$lib/dfg/components/settings.svelte";
  import BuildSettings from "$lib/dfg/components/build-settings.svelte";
  import SimplificationControls from "$lib/dfg/components/simplification-controls.svelte";
  import SplitField from "$lib/dfg/components/split-field.svelte";
  import VariantSummary from "$lib/dfg/components/variant-summary.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";

  let {
    project,
    graph,
    simplified,
    error,
    building,
    stale,
    variantsOpen = $bindable(false),
    buildSettingsOpen = $bindable(false),
    comparing = $bindable(false)
  }: {
    project: Project;
    graph: ResponseDfg | null;
    simplified: Simplified | null;
    error: string | null;
    building: boolean;
    stale: boolean;
    variantsOpen?: boolean;
    buildSettingsOpen?: boolean;
    comparing?: boolean;
  } = $props();

  const groups = $derived(comparedGroups());
</script>

<div class="border-border bg-background flex shrink-0 flex-nowrap items-stretch border-b">
  <CompareField {project} bind:open={comparing} />
  <VariantSummary {simplified} open={variantsOpen} onToggle={() => (variantsOpen = !variantsOpen)} />
  <BuildSettings {project} bind:open={buildSettingsOpen} />
  <SplitField groupCount={groups.length} />

  <div class="flex min-w-0 flex-1 items-center gap-3 px-3">
    {#if error}
      <p class="text-destructive truncate text-xs" title={error}>{error}</p>
    {:else if stale && building}
      <p class="text-muted-foreground text-xs">Rebuilding…</p>
    {/if}
    {#if graph && graph.overlapCases > 0}
      <p class="text-muted-foreground truncate text-xs">
        {formatNumber(graph.overlapCases)} cases in both groups
      </p>
    {/if}
    {#if graph?.skippedCaseLevel.length}
      <p class="text-muted-foreground truncate text-xs">
        Case-level attributes left out: {graph.skippedCaseLevel.join(", ")}
      </p>
    {/if}
  </div>

  {#if simplified}
    <SimplificationControls {simplified} />
  {/if}

  <div class="flex shrink-0 items-center px-3">
    <Settings />
  </div>
</div>
