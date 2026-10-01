<script lang="ts">
  /**
   * The tree's settings as a row of fields: what is compared, which Variants,
   * which attributes are tested, and how the result is drawn.
   */
  import CompareField from "$lib/groups/components/compare-field.svelte";
  import type { Project } from "$lib/event-log/types";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import BuildSettings from "$lib/tree/components/build-settings.svelte";
  import VariantSummary from "$lib/tree/components/variant-summary.svelte";
  import VisualizationSettings from "$lib/tree/components/visualization-settings.svelte";

  let {
    project,
    tree,
    error,
    variantsOpen = $bindable(false),
    buildSettingsOpen = $bindable(false),
    comparing = $bindable(false)
  }: {
    project: Project;
    tree: ResponseDirectedTree | null;
    error: string | null;
    variantsOpen?: boolean;
    buildSettingsOpen?: boolean;
    comparing?: boolean;
  } = $props();
</script>

<div class="border-border bg-background flex shrink-0 flex-nowrap items-stretch border-b">
  <CompareField {project} bind:open={comparing} />
  <VariantSummary {tree} open={variantsOpen} onToggle={() => (variantsOpen = !variantsOpen)} />
  <BuildSettings {project} bind:open={buildSettingsOpen} />

  <div class="flex min-w-0 flex-1 items-center px-3">
    {#if error}
      <p class="text-destructive truncate text-xs" title={error}>{error}</p>
    {/if}
  </div>

  {#if tree}
    <VisualizationSettings {tree} />
  {/if}
</div>
