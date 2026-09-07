<script lang="ts">
  /** A preview table's column header: what the column is mapped to, then its name. */
  import type { ColumnPick } from "$lib/event-log/utils/roles";
  import { pickMeta } from "$lib/event-log/utils/roles";
  import CircleOff from "@lucide/svelte/icons/circle-off";

  let { name, pick }: { name: string; pick: ColumnPick | null } = $props();
</script>

{#if pick}
  {@const Icon = pickMeta[pick].icon}
  <Icon class="size-3.5 shrink-0" aria-hidden="true" />
{:else}
  <CircleOff class="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
{/if}
<span>{name}</span>
