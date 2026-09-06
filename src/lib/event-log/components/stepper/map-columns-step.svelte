<script lang="ts">
  import type { ColumnType } from "$lib/event-log/invokers/types";
  import type { TimestampFormats } from "$lib/event-log/state/timestamp-formats.svelte";
  import type { AssignableRole, ColumnPick } from "$lib/event-log/utils/roles";
  import MappingPreviewTable from "./mapping-preview-table.svelte";
  import MappingRoleCards from "./mapping-role-cards.svelte";

  let {
    columns,
    rows,
    assignments = $bindable(),
    activeRole = $bindable(),
    hoveredCol = $bindable(),
    visibleColumns = $bindable(),
    roleByColumn,
    timestampFormats
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    assignments: Record<AssignableRole, string | null>;
    activeRole: ColumnPick | null;
    hoveredCol: number | null;
    visibleColumns: Set<string>;
    roleByColumn: Record<string, AssignableRole>;
    timestampFormats: TimestampFormats;
  } = $props();
</script>

<MappingRoleCards {assignments} bind:activeRole {visibleColumns} {timestampFormats} />
<MappingPreviewTable
  {columns}
  {rows}
  bind:assignments
  bind:activeRole
  bind:hoveredCol
  bind:visibleColumns
  {roleByColumn}
/>
