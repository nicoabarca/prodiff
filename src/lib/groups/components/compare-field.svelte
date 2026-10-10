<script lang="ts">
  /** Which Groups a view compares, over the popover that changes them. */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ComparePopover from "$lib/groups/components/compare-popover.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { ORIGINAL_ID } from "$lib/groups/types";
  import { colorVar } from "$lib/format";
  import { cn } from "$lib/utils";
  import type { Project } from "$lib/event-log/types";
  import GitCompare from "@lucide/svelte/icons/git-compare";

  let {
    project,
    open = $bindable(false),
    align = "start",
    class: className
  }: { project: Project; open?: boolean; align?: "start" | "end"; class?: string } = $props();

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
        class={cn("max-w-96 shrink-0 pl-4", className)}
        title={groups.map((group) => group.name).join(" vs ")}
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
          <span class="truncate">{group.name}</span>
        {/each}
        {#if groups.length < 2 && groups[0]?.id !== ORIGINAL_ID}
          <Badge>+ Add a group</Badge>
        {/if}
      </SettingField>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    {align}
    class={cn(
      "w-auto max-w-[calc(100vw-2rem)] gap-0 p-0",
      align === "end" ? "flex-row-reverse" : "flex-row"
    )}
  >
    <ComparePopover
      {project}
      editorSide={align === "end" ? "left" : "right"}
      onclose={() => (open = false)}
    />
  </Popover.Content>
</Popover.Root>
