<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import { groupPreview } from "$lib/groups/invokers/group-preview";
  import type { ResponsePreviewTable } from "$lib/groups/invokers/types";
  import type { Group } from "$lib/groups/types";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import FilterX from "@lucide/svelte/icons/filter-x";

  /**
   * The events of one Group, a page at a time. `narrowed` pins the table to one
   * Group and runs its filters after the Group's own, labelled by `label`.
   */
  let {
    project,
    groups,
    narrowed = null,
    columns
  }: {
    project: Project;
    groups: Group[];
    narrowed?: { group: Group; filters: Filter[]; label: string } | null;
    columns?: Snippet<[{ shown: number; total: number }]>;
  } = $props();

  /** Rows per page, in the order the selector offers them. */
  const PAGE_SIZES = [100, 500, 1000];

  let selectedId = $state("original");
  let offset = $state(0);
  let pageSize = $state(PAGE_SIZES[0]);
  let preview = $state<ResponsePreviewTable | null>(null);
  let error = $state<string | null>(null);

  const selected = $derived(
    narrowed?.group ?? groups.find((g) => g.id === selectedId) ?? groups[0]
  );
  const filters = $derived(selected ? [...selected.filters, ...(narrowed?.filters ?? [])] : []);
  const total = $derived(preview?.totalEvents ?? 0);
  const firstRow = $derived(total === 0 ? 0 : offset + 1);
  const lastRow = $derived(Math.min(offset + (preview?.rows.length ?? 0), total));
  const hasPrev = $derived(offset > 0);
  const hasNext = $derived(offset + pageSize < total);

  function toPage(next: number) {
    offset = Math.max(0, next);
  }

  function selectPageSize(value: string) {
    pageSize = Number(value);
    offset = 0;
  }

  function selectGroup(id: string) {
    selectedId = id;
    offset = 0;
  }

  // Hidden columns never reach the table, and neither does a column no applied
  // Custom Attribute or Column Mapping entry names.
  const known = $derived(analysisColumns(project).map((c) => c.name));
  const visible = $derived(
    (preview?.columns ?? [])
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !project.hiddenColumns.includes(name) && known.includes(name))
  );

  $effect(() => {
    const wanted = filters;
    if (!selected) return;

    let stale = false;
    preview = null;
    error = null;
    groupPreview(project, wanted, offset, pageSize)
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

<div class="flex min-h-0 flex-1 flex-col" data-tour="event-data-table">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
    {#if narrowed}
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold">
        <span class="size-2" style="background:{colorVar(narrowed.group.color)}" aria-hidden="true"
        ></span>
        {narrowed.group.name}
      </span>
      <span class="text-muted-foreground font-mono text-[0.6875rem]">{narrowed.label}</span>
    {:else}
      <div class="inline-flex border" role="group" aria-label="Group">
        {#each groups as group (group.id)}
          <button
            type="button"
            aria-pressed={selected?.id === group.id}
            class="inline-flex h-7 cursor-pointer items-center gap-1.5 border-r px-2.5 text-xs font-medium last:border-r-0 {selected?.id ===
            group.id
              ? 'bg-muted text-foreground'
              : 'bg-card text-foreground/60 hover:text-foreground'}"
            onclick={() => selectGroup(group.id)}
          >
            <span class="size-2" style="background:{colorVar(group.color)}" aria-hidden="true"
            ></span>
            {group.name}
          </button>
        {/each}
      </div>
    {/if}
    {#if columns}
      <span class="text-muted-foreground ml-auto text-[0.6875rem]">
        {@render columns({ shown: visible.length, total: project.columns.length })}
      </span>
    {/if}
  </div>
  <div class="min-h-0 flex-1 overflow-auto">
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
                <AttributeName name={column.name} />
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
  <div
    class="bg-sidebar text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5"
  >
    <span class="text-xs">
      {#if preview}
        Rows {formatNumber(firstRow)}&ndash;{formatNumber(lastRow)} of {formatNumber(total)} in
        {selected?.name}
      {/if}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <Select.Root type="single" value={String(pageSize)} onValueChange={selectPageSize}>
        <Select.Trigger size="sm">
          {formatNumber(pageSize)} rows
        </Select.Trigger>
        <Select.Content>
          {#each PAGE_SIZES as size (size)}
            <Select.Item value={String(size)} label="{formatNumber(size)} rows">
              {formatNumber(size)} rows
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <Button
        variant="outline"
        size="icon"
        class="size-7"
        disabled={!hasPrev}
        aria-label="Previous page"
        onclick={() => toPage(offset - pageSize)}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="size-7"
        disabled={!hasNext}
        aria-label="Next page"
        onclick={() => toPage(offset + pageSize)}
      >
        <ChevronRight />
      </Button>
    </div>
  </div>
</div>
