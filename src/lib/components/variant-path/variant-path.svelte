<script lang="ts">
  /**
   * A Variant's trace as a row of chevron chips, one per activity, scrolling
   * sideways when it does not fit.
   */
  import { cn } from "$lib/utils";

  let { activities, class: className }: { activities: string[]; class?: string } = $props();

  /** The notch each chevron cuts into the chip behind it. */
  const NOTCH = "0.5rem";

  /** A flat left edge opens the trace; every chip after it is notched. */
  function chevron(step: number): string {
    const tail = step === 0 ? "" : `, ${NOTCH} 50%`;
    return `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%${tail})`;
  }
</script>

<span
  class={cn(
    "thin-scrollbars flex h-10 w-full min-w-0 items-center overflow-x-auto overflow-y-hidden overscroll-x-contain py-1",
    className
  )}
  title={activities.join(" → ")}
>
  {#each activities as activity, step (step)}
    <span
      class="bg-muted-foreground/45 -mr-1 max-w-32 shrink-0 p-px"
      style="clip-path:{chevron(step)}"
    >
      <span
        class={cn(
          "bg-secondary text-secondary-foreground block truncate py-1 pr-4 text-[0.6875rem] leading-tight",
          step === 0 ? "pl-2.5" : "pl-4"
        )}
        style="clip-path:{chevron(step)}"
      >
        {activity}
      </span>
    </span>
  {/each}
</span>
