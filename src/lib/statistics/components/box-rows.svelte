<script lang="ts">
  import { colorTint, colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { Axis } from "$lib/statistics/utils/axis";

  /** A box as drawn: quartiles and median, Tukey whiskers. */
  interface Box {
    q1: number;
    median: number;
    q3: number;
    whiskerLow: number;
    whiskerHigh: number;
  }

  let {
    groups,
    boxes,
    axis,
    format
  }: {
    groups: Group[];
    boxes: Record<string, Box | null>;
    axis: Axis;
    format: (value: number) => string;
  } = $props();

  const at = (value: number) => `${axis.position(value) * 100}%`;
  const span = (from: number, to: number) =>
    `${Math.max(0, axis.position(to) - axis.position(from)) * 100}%`;
  import GroupName from "$lib/statistics/components/group-name.svelte";
</script>

<div class="flex flex-col gap-2.5">
  {#each groups as group (group.id)}
    {@const box = boxes[group.id]}
    <div class="flex items-center gap-4">
      <span class="flex w-24 shrink-0 justify-end text-xs"><GroupName {group} /></span>
      <span class="relative mr-6 h-10.5 min-w-0 flex-1">
        {#if box}
          <span
            class="text-muted-foreground absolute top-3.5 -translate-x-1/2 -translate-y-full font-mono text-[0.625rem] whitespace-nowrap"
            style="left:{at(box.median)}">{format(box.median)}</span
          >
          <span
            class="bg-border absolute top-6.75 h-px"
            style="left:{at(box.whiskerLow)}; width:{span(box.whiskerLow, box.whiskerHigh)}"
          ></span>
          <span
            class="bg-muted-foreground absolute top-5.25 h-3.25 w-px"
            style="left:{at(box.whiskerLow)}"
          ></span>
          <span
            class="bg-muted-foreground absolute top-5.25 h-3.25 w-px"
            style="left:{at(box.whiskerHigh)}"
          ></span>
          <span
            class="absolute top-4.5 h-4.75 border"
            style="left:{at(box.q1)}; width:{span(box.q1, box.q3)}; border-color:{colorVar(
              group.color
            )}; background:{colorTint(group.color, 16)}"
          ></span>
          <span
            class="absolute top-4 h-5.75 w-0.5"
            style="left:{at(box.median)}; background:{colorVar(group.color)}"
          ></span>
        {:else}
          <span class="text-muted-foreground absolute top-3 text-[0.6875rem]">No cases</span>
        {/if}
      </span>
      <span class="text-muted-foreground w-36 shrink-0 font-mono text-[0.6875rem]">
        {box ? `${format(box.q1)} – ${format(box.q3)}` : ""}
      </span>
    </div>
  {/each}
  <div class="flex items-center gap-4">
    <span class="w-24 shrink-0"></span>
    <span class="relative mr-6 h-4.5 min-w-0 flex-1 border-t">
      {#each axis.ticks as tick (tick.value)}
        <span
          class="text-muted-foreground absolute top-1 -translate-x-1/2 font-mono text-[0.625rem] whitespace-nowrap"
          style="left:{at(tick.value)}">{tick.label}</span
        >
      {/each}
    </span>
    <span class="text-muted-foreground w-36 shrink-0 text-[0.625rem] tracking-[0.06em] uppercase">
      Q1 – Q3
    </span>
  </div>
</div>
