<script lang="ts">
  /**
   * One Variant: its trace, and what each Group brings to it. The row is itself
   * the checkbox, so anywhere on it stages the Variant; hovering lights its path
   * on the canvas.
   */
  import { formatNumber } from "$lib/format";
  import Check from "@lucide/svelte/icons/check";
  import type { ResponseVariantRow } from "$lib/tree/invokers/types";
  import { variantEvents } from "$lib/tree/utils/variants";
  import type { Group } from "$lib/groups/types";

  let {
    row,
    number,
    columns,
    accents,
    totals,
    staged,
    onTree,
    onToggle,
    onHover
  }: {
    row: ResponseVariantRow;
    number: number;
    columns: Group[];
    accents: Record<string, string>;
    totals: Record<string, number>;
    staged: boolean;
    onTree: boolean;
    onToggle: () => void;
    onHover: (key: string | null) => void;
  } = $props();

  function share(cases: number, total: number): string {
    return total > 0 ? `${((cases / total) * 100).toFixed(1)}%` : "—";
  }
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={staged}
  aria-label="Stage variant {number}"
  class="hover:bg-accent/50 flex h-16 w-full cursor-pointer items-center gap-2 rounded px-1 text-left text-xs"
  onclick={onToggle}
  onmouseenter={() => onHover(row.key)}
  onmouseleave={() => onHover(null)}
>
  <span
    class="flex size-4 shrink-0 items-center justify-center border {staged
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-input'}"
  >
    {#if staged}
      <Check class="size-3.5" />
    {/if}
  </span>

  <div class="flex min-w-0 flex-1 flex-col gap-1">
    <div class="flex items-center gap-1.5">
      <span
        class="size-1.5 shrink-0 rounded-full"
        style={onTree ? `background:${accents[columns[0].id]}` : ""}
        title={onTree ? "On the tree" : "Not in this build"}
      ></span>
      <span class="shrink-0 tabular-nums">Variant {number}</span>
    </div>
    <div class="flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5">
      {#each row.activities as activity, step (step)}
        <span
          class="bg-muted/60 max-w-32 shrink-0 truncate rounded px-1.5 py-0.5 text-[0.625rem]"
          title={activity}
        >
          {activity}
        </span>
      {/each}
    </div>
  </div>

  {#each columns as group (group.id)}
    {@const cases = row.cases[group.id] ?? 0}
    <span class="flex w-28 shrink-0 flex-col items-end tabular-nums">
      {#if cases > 0}
        <span style="color:{accents[group.id]}">{formatNumber(cases)}</span>
        <span class="text-[0.625rem] opacity-70" style="color:{accents[group.id]}">
          {share(cases, totals[group.id])}
        </span>
        <span class="text-muted-foreground text-[0.625rem]">
          {formatNumber(variantEvents(row, group.id))} events
        </span>
      {:else}
        <span class="text-muted-foreground">—</span>
      {/if}
    </span>
  {/each}
</button>
