<script lang="ts">
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { view } from "$lib/dfg/state/view.svelte";

  let {
    activitiesShown,
    activitiesTotal,
    pathsShown,
    pathsTotal
  }: {
    activitiesShown: number;
    activitiesTotal: number;
    pathsShown: number;
    pathsTotal: number;
  } = $props();

  /**
   * The sliders read as detail, not as a threshold: full is everything the log
   * has. The cutoffs behind them run the other way, so this is where the two
   * meet.
   */
  const detail = (cutoff: number) => 1 - cutoff;
  const cutoff = (detail: number) => 1 - detail;
</script>

<div
  class="border-border bg-background/90 absolute top-4 right-4 z-10 flex gap-5 rounded-[0.5rem] border px-4 py-3 backdrop-blur"
>
  {#each [{ label: "Activities", shown: activitiesShown, total: activitiesTotal, value: view.nodeCutoff, set: (next: number) => (view.nodeCutoff = next) }, { label: "Paths", shown: pathsShown, total: pathsTotal, value: view.edgeCutoff, set: (next: number) => (view.edgeCutoff = next) }] as control (control.label)}
    <div class="flex w-16 flex-col items-center gap-2">
      <span class="text-[0.625rem] font-medium tracking-wide uppercase">{control.label}</span>
      <span class="font-mono text-xs font-semibold">
        {Math.round(detail(control.value) * 100)}%
      </span>
      <Slider
        type="single"
        orientation="vertical"
        class="h-40"
        value={detail(control.value)}
        onValueChange={(next: number) => control.set(cutoff(next))}
        min={0}
        max={1}
        step={0.01}
      />
      <span class="text-muted-foreground font-mono text-[0.625rem]">
        {control.shown}/{control.total}
      </span>
    </div>
  {/each}
</div>
