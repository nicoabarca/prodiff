<script lang="ts">
  /**
   * The tree's settings as a row of fields: what is compared, which Variants,
   * which attributes are tested, and how the result is drawn.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import CompareDialog from "$lib/groups/components/compare-dialog.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Project } from "$lib/event-log/types";
  import { colorVar } from "$lib/format";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import BuildSettings from "$lib/tree/components/build-settings.svelte";
  import SettingField from "$lib/tree/components/setting-field.svelte";
  import VariantSummary from "$lib/tree/components/variant-summary.svelte";
  import VisualizationSettings from "$lib/tree/components/visualization-settings.svelte";
  import GitCompare from "@lucide/svelte/icons/git-compare";

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

  const groups = $derived(comparedGroups());
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
    {/if}
  </SettingField>
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

<CompareDialog {project} bind:open={comparing} />
