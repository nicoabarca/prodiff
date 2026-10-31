<script lang="ts">
  /**
   * One Variant, on two lines: its full trace above, what each Group brings to it
   * below. The box stages it and the eye lights its path on the canvas.
   */
  import VariantPath from "$lib/components/variant-path/variant-path.svelte";
  import { formatNumber } from "$lib/format";
  import type { ResponseVariantRow } from "$lib/tree/invokers/types";
  import { variantEvents } from "$lib/tree/utils/variants";
  import type { Group } from "$lib/groups/types";
  import Check from "@lucide/svelte/icons/check";
  import Eye from "@lucide/svelte/icons/eye";
  import Network from "@lucide/svelte/icons/network";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  let {
    row,
    number,
    columns,
    accents,
    totals,
    staged,
    highlighted,
    drawn,
    canvas,
    onToggle,
    onHighlight
  }: {
    row: ResponseVariantRow;
    number: number;
    columns: Group[];
    accents: Record<string, string>;
    totals: Record<string, number>;
    staged: boolean;
    highlighted: boolean;
    drawn: boolean;
    canvas: "tree" | "graph";
    onToggle: () => void;
    onHighlight: () => void;
  } = $props();

  const CanvasIcon = $derived(canvas === "tree" ? Network : Waypoints);

  function share(cases: number, total: number): string {
    return total > 0 ? `${((cases / total) * 100).toFixed(1)}%` : "";
  }
</script>

<div class="hover:bg-accent/50 px-3 text-xs">
  <div class="flex h-[5.5rem] items-start gap-2 py-2.5">
    <button
      type="button"
      role="checkbox"
      aria-checked={staged}
      aria-label="Stage variant {number}"
      class="mt-0.5 flex size-4 shrink-0 cursor-pointer items-center justify-center border {staged
        ? 'bg-primary text-primary-foreground border-primary'
        : 'border-input'}"
      onclick={onToggle}
    >
      {#if staged}
        <Check class="size-3" strokeWidth={3} />
      {/if}
    </button>

    <span
      class="mt-0.5 flex size-3.5 shrink-0 items-center justify-center"
      title={drawn ? `On the ${canvas}` : "Not in this build"}
    >
      {#if drawn}
        <CanvasIcon class="text-foreground size-3.5" />
      {/if}
    </span>

    <span class="text-muted-foreground mt-0.5 w-8 shrink-0 font-mono text-[0.6875rem] tabular-nums">
      {number}
    </span>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <VariantPath activities={row.activities} />

      <span class="flex items-center gap-2">
        {#if drawn}
          <button
            type="button"
            aria-pressed={highlighted}
            aria-label="Light the path of variant {number} on the {canvas}"
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center border {highlighted
              ? 'border-indigo-500 text-indigo-500'
              : 'border-border text-muted-foreground hover:text-foreground'}"
            onclick={onHighlight}
          >
            <Eye class="size-3.5" />
          </button>
        {/if}

        <span class="ml-auto"></span>
        {#each columns as group (group.id)}
          {@const cases = row.cases[group.id] ?? 0}
          {@const ink = cases > 0 ? accents[group.id] : "var(--muted-foreground)"}
          <span
            class="flex shrink-0 gap-2 text-right font-mono text-[0.6875rem] tabular-nums"
            style="color:{ink}"
          >
            <span class="w-14">{cases > 0 ? formatNumber(cases) : "—"}</span>
            <span class="w-12 opacity-85">{cases > 0 ? share(cases, totals[group.id]) : ""}</span>
            <span class="text-muted-foreground w-14">
              {cases > 0 ? formatNumber(variantEvents(row, group.id)) : "—"}
            </span>
          </span>
        {/each}
      </span>
    </div>
  </div>
</div>
