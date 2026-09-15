<script lang="ts">
  /**
   * One Variant, on two lines: its full trace above, what each Group brings to it
   * below. The box stages it and the eye lights its path on the canvas.
   */
  import { formatNumber } from "$lib/format";
  import Check from "@lucide/svelte/icons/check";
  import Eye from "@lucide/svelte/icons/eye";
  import Waypoints from "@lucide/svelte/icons/waypoints";
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
    highlighted,
    onGraph,
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
    onGraph: boolean;
    onToggle: () => void;
    onHighlight: () => void;
  } = $props();

  /** The notch each chevron cuts into the chip behind it. */
  const NOTCH = "0.5rem";

  /** A flat left edge opens the trace; every chip after it is notched. */
  function chevron(step: number): string {
    const tail = step === 0 ? "" : `, ${NOTCH} 50%`;
    return `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%${tail})`;
  }

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
      title={onGraph ? "On the graph" : "Not in this build"}
    >
      {#if onGraph}
        <Waypoints class="text-foreground size-3.5" />
      {/if}
    </span>

    <span class="text-muted-foreground mt-0.5 w-8 shrink-0 font-mono text-[0.6875rem] tabular-nums">
      {number}
    </span>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <span
        class="thin-scrollbars flex h-10 w-full min-w-0 items-center overflow-x-auto overflow-y-hidden overscroll-x-contain py-1"
        title={row.activities.join(" → ")}
      >
        {#each row.activities as activity, step (step)}
          <span
            class="bg-muted-foreground/45 -mr-1 max-w-32 shrink-0 p-px"
            style="clip-path:{chevron(step)}"
          >
            <span
              class="bg-secondary text-secondary-foreground block truncate py-1 pr-4 text-[0.6875rem] leading-tight {step ===
              0
                ? 'pl-2.5'
                : 'pl-4'}"
              style="clip-path:{chevron(step)}"
            >
              {activity}
            </span>
          </span>
        {/each}
      </span>

      <span class="flex items-center gap-2">
        {#if onGraph}
          <button
            type="button"
            aria-pressed={highlighted}
            aria-label="Light the path of variant {number} on the graph"
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
