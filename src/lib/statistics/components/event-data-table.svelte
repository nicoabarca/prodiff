<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import { groupPreview } from "$lib/groups/invokers/group-preview";
  import type { ResponsePreviewTable } from "$lib/groups/invokers/types";
  import type { Group } from "$lib/groups/types";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import FilterX from "@lucide/svelte/icons/filter-x";
  import Info from "@lucide/svelte/icons/info";

  let { project, groups }: { project: Project; groups: Group[] } = $props();

  /** Rows fetched per Group. */
  const PREVIEW_LIMIT = 100;

  let selectedId = $state("whole");
  let preview = $state<ResponsePreviewTable | null>(null);
  let error = $state<string | null>(null);

  const selected = $derived(groups.find((g) => g.id === selectedId) ?? groups[0]);

  // Hidden columns are inert in all analysis, so they never reach the table.
  const visible = $derived(
    (preview?.columns ?? [])
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !project.hiddenColumns.includes(name))
  );

  $effect(() => {
    const group = selected;
    if (!group) return;

    let stale = false;
    preview = null;
    error = null;
    groupPreview(project, group.filters, PREVIEW_LIMIT)
      .then((result) => {
        if (!stale) preview = result;
      })
      .catch((cause) => {
        if (!stale) error = String(cause);
      });

    return () => {
      stale = true;
    };
  });
</script>

<Card.Root class="gap-0 py-0">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
    <span class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">Event log data</span>
    <Tabs.Root bind:value={selectedId} class="ml-auto">
      <Tabs.List class="bg-card gap-0 border p-0">
        {#each groups as group (group.id)}
          <Tabs.Trigger value={group.id} class="data-active:bg-muted border-r px-2.5 py-1">
            <span
              class="size-2 shrink-0"
              style="background:{colorVar(group.color)}"
              aria-hidden="true"
            ></span>
            {group.name}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </div>
  <div>
    {#if error}
      <div class="p-4">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not read the event log</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    {:else if !preview}
      <div class="flex flex-col gap-2 p-4">
        {#each { length: 6 } as _, row (row)}
          <Skeleton class="h-6 w-full" />
        {/each}
      </div>
    {:else if preview.rows.length === 0}
      <Empty.Root>
        <Empty.Header>
          <Empty.Media variant="icon">
            <FilterX />
          </Empty.Media>
          <Empty.Title>No events</Empty.Title>
          <Empty.Description>
            No events match this group's filters. Loosen a filter to see data here.
          </Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row class="hover:bg-transparent">
            {#each visible as column (column.name)}
              <Table.Head
                class="bg-sidebar text-muted-foreground sticky top-0 h-auto px-3 py-2 text-[0.625rem] font-bold tracking-[0.06em] whitespace-nowrap uppercase"
              >
                {column.name}
              </Table.Head>
            {/each}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each preview.rows as row, rowIndex (rowIndex)}
            <Table.Row>
              {#each visible as column (column.name)}
                <Table.Cell class="px-3 py-1.5 font-mono whitespace-nowrap">
                  {row[column.index]}
                </Table.Cell>
              {/each}
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </div>
  <div class="bg-sidebar text-muted-foreground flex items-center gap-2 border-t px-4 py-2.5">
    <Info class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="text-xs">
      {#if preview}
        Previewing {formatNumber(preview.rows.length)} of {formatNumber(preview.totalEvents)} events in
        {selected?.name} — the full data is never loaded into the table.
      {:else}
        The full data is never loaded into the table.
      {/if}
    </span>
  </div>
</Card.Root>
