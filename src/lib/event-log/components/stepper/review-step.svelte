<script lang="ts">
  import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
  import type { AssignableRole } from "$lib/event-log/utils/roles";
  import { roleMeta } from "$lib/event-log/utils/roles";
  import { GRANULARITY_LABELS } from "$lib/event-log/utils/field-settings";
  import * as Table from "$lib/components/ui/table/index.js";
  import FileCheck from "@lucide/svelte/icons/file-check";
  import Info from "@lucide/svelte/icons/info";

  let {
    fileName,
    mapping,
    roleByColumn,
    hiddenColumnNames
  }: {
    fileName: string;
    mapping: RequestColumnMapping[];
    roleByColumn: Record<string, AssignableRole>;
    hiddenColumnNames: string[];
  } = $props();

  const hiddenSet = $derived(new Set(hiddenColumnNames));

  const visibleMapping = $derived(mapping.filter((col) => !hiddenSet.has(col.name)));

  function roleLabel(name: string): string {
    const role = roleByColumn[name];
    return role ? roleMeta[role].label : "Extra field";
  }
</script>

<div class="border-primary bg-primary/5 mb-5 flex shrink-0 items-center gap-3 border-l-4 px-4 py-3">
  <FileCheck class="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
  <p class="text-foreground text-base font-medium text-pretty">
    Review the column mapping for <span class="font-mono">{fileName}</span> before it is sent to
    create the project.
  </p>
</div>

<div class="border-border bg-card mb-5 flex shrink-0 items-center gap-3 border px-4 py-2">
  <Info class="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
  <p class="text-muted-foreground text-xs">
    Hidden columns are retained. They can be made visible again from the project settings.
  </p>
</div>

<div class="border-border bg-card flex max-h-105 min-h-0 flex-col border">
  <div
    class="border-border bg-primary/5 border-b-primary/30 flex shrink-0 items-center justify-between border-b-2 px-4 py-2"
  >
    <span class="text-primary text-xs font-semibold tracking-widest uppercase">Column mapping</span>
    <span class="text-muted-foreground text-xs"
      >{visibleMapping.length} column{visibleMapping.length === 1 ? "" : "s"}</span
    >
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <Table.Root>
      <Table.Header>
        <Table.Row class="hover:bg-transparent">
          <Table.Head>Field name</Table.Head>
          <Table.Head>Role</Table.Head>
          <Table.Head>Granularity</Table.Head>
          <Table.Head>Data type</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each visibleMapping as { name, type, granularity }}
          {@const required = roleByColumn[name] !== undefined}
          <Table.Row class="hover:bg-primary/5">
            <Table.Cell class="font-mono text-xs">{name}</Table.Cell>
            <Table.Cell>
              <span
                class={`text-xs ${required ? "text-primary font-semibold" : "text-foreground"}`}
              >
                {roleLabel(name)}
              </span>
            </Table.Cell>
            <Table.Cell class="text-xs">{GRANULARITY_LABELS[granularity]}</Table.Cell>
            <Table.Cell class="font-mono text-xs">{type}</Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
