<script lang="ts">
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { readersByColumn } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { allGroups, isApplied } from "$lib/groups/state/groups.svelte";
  import EventLogPage from "$lib/event-log/components/page/event-log-page.svelte";
  import EventDataTable from "$lib/statistics/components/event-data-table.svelte";

  const project = $derived(currentProject());
</script>

{#if project}
  <EventLogPage {project} readers={readersByColumn(project)}>
    {#snippet data(showColumns)}
      <EventDataTable {project} groups={allGroups(project.id).filter(isApplied)}>
        {#snippet columns({ shown, total })}
          Showing {shown} of {total} columns ·
          <button
            type="button"
            class="text-primary hover:text-foreground cursor-pointer"
            onclick={showColumns}
          >
            change in Columns
          </button>
        {/snippet}
      </EventDataTable>
    {/snippet}
  </EventLogPage>
{/if}
