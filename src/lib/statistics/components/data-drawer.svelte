<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import type { Group } from "$lib/groups/types";
  import EventDataTable from "$lib/statistics/components/event-data-table.svelte";

  let {
    open = $bindable(false),
    project,
    groups,
    narrowed
  }: {
    open?: boolean;
    project: Project;
    groups: Group[];
    narrowed: { group: Group; filters: Filter[]; label: string } | null;
  } = $props();
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="bottom" class="bg-card gap-0 p-0 data-[side=bottom]:h-[28rem]">
    <Sheet.Header class="border-b px-4 py-3">
      <Sheet.Title class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">
        Event log data
      </Sheet.Title>
      <Sheet.Description class="sr-only">The events behind the statistics.</Sheet.Description>
    </Sheet.Header>
    <EventDataTable {project} {groups} {narrowed}>
      {#snippet columns({ shown, total })}
        {shown} of {total} columns shown ·
        <a class="text-primary hover:text-foreground" href="/app/projects/{project.id}/event-log">
          change in Event log
        </a>
      {/snippet}
    </EventDataTable>
  </Sheet.Content>
</Sheet.Root>
