<script lang="ts">
  /**
   * The graph's settings as a row of fields: what is compared, which Variants,
   * which attributes are tested, and how the result is drawn.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import CompareDialog from "$lib/groups/components/compare-dialog.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Project } from "$lib/event-log/types";
  import { colorVar, formatNumber } from "$lib/format";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import BuildSettings from "$lib/dfg/components/build-settings.svelte";
  import { splitting, view } from "$lib/dfg/state/view.svelte";
  import VariantSummary from "$lib/dfg/components/variant-summary.svelte";
  import VisualizationSettings from "$lib/dfg/components/visualization-settings.svelte";
  import GitCompare from "@lucide/svelte/icons/git-compare";

  let {
    project,
    graph,
    error,
    building,
    stale,
    variantsOpen = $bindable(false),
    buildSettingsOpen = $bindable(false),
    comparing = $bindable(false)
  }: {
    project: Project;
    graph: ResponseDfg | null;
    error: string | null;
    building: boolean;
    stale: boolean;
    variantsOpen?: boolean;
    buildSettingsOpen?: boolean;
    comparing?: boolean;
  } = $props();

  const groups = $derived(comparedGroups());
  const split = $derived(splitting(groups.length));
</script>

<div class="border-border bg-background flex shrink-0 flex-nowrap items-stretch border-b">
  <SettingField
    icon={GitCompare}
    caption={groups.length > 1 ? "Compare groups" : "Compare · only 1 group selected"}
    open={comparing}
    class="shrink-0 pl-4"
    data-tour="compare-groups"
    onclick={() => (comparing = true)}
  >
    {#each groups as group, i (group.id)}
      {#if i > 0}
        <span class="text-muted-foreground font-normal">vs</span>
      {/if}
      <span
        class="size-2 shrink-0 rounded-full"
        style="background:{colorVar(group.color)}"
        aria-hidden="true"
      ></span>
      {group.name}
    {/each}
    {#if groups.length < 2}
      <Badge>+ Add a group</Badge>
    {:else if split}
      <Badge variant="secondary">Split</Badge>
    {/if}
  </SettingField>
  <VariantSummary {graph} open={variantsOpen} onToggle={() => (variantsOpen = !variantsOpen)} />
  <BuildSettings {project} bind:open={buildSettingsOpen} />

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

  <VisualizationSettings />
</div>

<CompareDialog
  {project}
  bind:open={comparing}
  splitting={split}
  onSplit={(on) => (view.split = on)}
/>
