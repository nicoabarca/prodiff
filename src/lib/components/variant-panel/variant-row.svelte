<script lang="ts" module>
  /** A row's height in rem: its trace, then one line per Group column. */
  export function rowHeight(columns: number): number {
    return 3.75 + 1.25 * columns;
  }
</script>

<script lang="ts">
  /**
   * One Variant: its full trace on top, then one line per Group with its cases
   * and share of that Group's cases. The box stages it and the eye lights
   * its path on the canvas.
   */
  import Fit from "$lib/components/fit/fit.svelte";
  import VariantPath from "$lib/components/variant-path/variant-path.svelte";
  import { formatNumber } from "$lib/format";
  import type { ResponseVariantRow } from "$lib/tree/invokers/types";
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
    onPress,
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
    onPress: (y: number, shift: boolean) => void;
    onHighlight: () => void;
  } = $props();

  const CanvasIcon = $derived(canvas === "tree" ? Network : Waypoints);

  /** Whether a press landed on a scrollbar, which sits inside an overflowing
      element's box but outside its client area. Inline elements and SVG report a
      client size of 0, so only an element that overflows counts. */
  function onScrollbar(event: PointerEvent): boolean {
    const target = event.target as Element;
    const across = target.scrollWidth > target.clientWidth && event.offsetY >= target.clientHeight;
    const down = target.scrollHeight > target.clientHeight && event.offsetX >= target.clientWidth;
    return across || down;
  }

  function share(cases: number, total: number): string {
    return total > 0 ? `${((cases / total) * 100).toFixed(1)}%` : "";
  }
</script>

<!-- Pressing anywhere on the row stages it, and a Shift drag carries that over the rows passed. The checkbox is the keyboard path. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="hover:bg-accent/50 flex cursor-pointer items-start gap-2 px-3 py-2.5 text-xs select-none"
  style:height="{rowHeight(columns.length)}rem"
  onpointerdown={(event) => {
    if (event.button !== 0 || onScrollbar(event)) return;
    event.preventDefault();
    onPress(event.clientY, event.shiftKey);
  }}
>
  <button
    type="button"
    role="checkbox"
    aria-checked={staged}
    aria-label="Stage variant {number}"
    class="mt-3 flex size-4 shrink-0 cursor-pointer items-center justify-center border {staged
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-input'}"
    onclick={(event) => {
      if (event.detail === 0) onToggle();
    }}
  >
    {#if staged}
      <Check class="size-3" strokeWidth={3} />
    {/if}
  </button>

  <span
    class="mt-3 flex size-3.5 shrink-0 items-center justify-center"
    title={drawn ? `On the ${canvas}` : "Not in this build"}
  >
    {#if drawn}
      <CanvasIcon class="text-foreground size-3.5" />
    {/if}
  </span>

  <span class="text-muted-foreground mt-3 w-8 shrink-0 font-mono text-[0.6875rem] tabular-nums">
    {number}
  </span>

  <div class="flex min-w-0 flex-1 flex-col gap-1">
    <!-- Chips and eye are pinned to the top: a sideways scrollbar would otherwise lift the chips. -->
    <div class="flex min-w-0 items-start gap-2">
      <VariantPath activities={row.activities} class="items-start pt-2" />
      {#if drawn}
        <button
          type="button"
          aria-pressed={highlighted}
          aria-label="Light the path of variant {number} on the {canvas}"
          class="mt-2 flex size-6 shrink-0 cursor-pointer items-center justify-center border {highlighted
            ? 'border-indigo-500 text-indigo-500'
            : 'border-border text-muted-foreground hover:text-foreground'}"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={onHighlight}
        >
          <Eye class="size-4" />
        </button>
      {/if}
    </div>

    {#each columns as group (group.id)}
      {@const cases = row.cases[group.id] ?? 0}
      {@const total = totals[group.id]}
      {@const ink = cases > 0 ? accents[group.id] : "var(--muted-foreground)"}
      <div
        class="flex h-4 min-w-0 items-center gap-2 font-mono text-[0.6875rem] tabular-nums"
        style="color:{ink}"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          style="background:{cases > 0 ? accents[group.id] : 'var(--border)'}"
        ></span>
        <Fit text={group.name} focusable={false} class="flex-1 font-sans" />
        <span class="min-w-14 text-right">{cases > 0 ? formatNumber(cases) : "—"}</span>
        <span class="w-20 shrink-0 text-right">{cases > 0 ? share(cases, total) : "—"}</span>
      </div>
    {/each}
  </div>
</div>
