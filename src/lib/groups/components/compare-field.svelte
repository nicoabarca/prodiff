<script lang="ts">
  /** Which Groups a view compares, over the popover that changes them. */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ComparePopover from "$lib/groups/components/compare-popover.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { colorVar } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import GitCompare from "@lucide/svelte/icons/git-compare";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const groups = $derived(comparedGroups());
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <SettingField
        {...props}
        icon={GitCompare}
        caption={groups.length > 1 ? "Compare groups" : "Compare · only 1 group selected"}
        {open}
        class="shrink-0 pl-4"
        data-tour="compare-groups"
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
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-150 max-w-[calc(100vw-2rem)] flex-row gap-0 p-0">
    <ComparePopover {project} onclose={() => (open = false)} />
  </Popover.Content>
</Popover.Root>
