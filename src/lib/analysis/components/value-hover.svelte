<script lang="ts">
  /**
   * A crosshair over a plot that reads the value under the pointer on the
   * value axis. `invert` turns pixels from the plot's start into a value.
   * Goes inside a layerchart `Chart`, above the plot.
   */
  import { Html } from "layerchart";

  let {
    horizontal,
    invert,
    format
  }: {
    horizontal: boolean;
    invert: (pixel: number) => number;
    format: (value: number) => string;
  } = $props();

  /** Pixels from the plot's start along the value axis to the pointer, null while it is outside. */
  let pointer = $state<number | null>(null);
</script>

<Html>
  <div
    role="presentation"
    class="absolute inset-0 cursor-crosshair"
    onpointermove={(event) => (pointer = horizontal ? event.offsetX : event.offsetY)}
    onpointerleave={() => (pointer = null)}
  >
    {#if pointer !== null}
      {#if horizontal}
        <div
          class="bg-foreground/40 pointer-events-none absolute inset-y-0 w-px"
          style="left:{pointer}px"
        ></div>
        <span
          class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full -translate-x-1/2 border px-1 py-0.5 font-mono text-[0.625rem] whitespace-nowrap tabular-nums"
          style="left:{pointer}px"
        >
          {format(invert(pointer))}
        </span>
      {:else}
        <div
          class="bg-foreground/40 pointer-events-none absolute inset-x-0 h-px"
          style="top:{pointer}px"
        ></div>
        <span
          class="bg-popover text-popover-foreground border-border pointer-events-none absolute right-full -translate-y-1/2 border px-1 py-0.5 font-mono text-[0.625rem] whitespace-nowrap tabular-nums"
          style="top:{pointer}px"
        >
          {format(invert(pointer))}
        </span>
      {/if}
    {/if}
  </div>
</Html>
