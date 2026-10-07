<script lang="ts">
  /** Which Groups a view compares, and the dialog that changes them. */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import CompareDialog from "$lib/groups/components/compare-dialog.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { colorVar } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import GitCompare from "@lucide/svelte/icons/git-compare";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const groups = $derived(comparedGroups());
</script>

<SettingField
  icon={GitCompare}
  caption={groups.length > 1 ? "Compare groups" : "Compare · only 1 group selected"}
  {open}
  class="shrink-0 pl-4"
  data-tour="compare-groups"
  onclick={() => (open = true)}
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

<CompareDialog {project} bind:open />
