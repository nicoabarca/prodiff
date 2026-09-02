<script lang="ts">
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { view } from "$lib/dfg/state/view.svelte";

  let {
    activities,
    paths
  }: {
    activities: { shown: number; total: number };
    paths: { shown: number; total: number };
  } = $props();

  const controls = $derived([
    {
      label: "Activities",
      shown: activities.shown,
      total: activities.total,
      value: view.activities,
      set: (next: number) => (view.activities = next)
    },
    {
      label: "Paths",
      shown: paths.shown,
      total: paths.total,
      value: view.paths,
      set: (next: number) => (view.paths = next)
    }
  ]);
</script>

<div
  class="border-border bg-background/90 absolute top-4 right-4 z-10 flex gap-5 rounded-[0.5rem] border px-4 py-3 backdrop-blur"
>
  {#each controls as control (control.label)}
    <div class="flex w-16 flex-col items-center gap-2">
      <span class="text-[0.625rem] font-medium tracking-wide uppercase">{control.label}</span>
      <span class="font-mono text-xs font-semibold">{Math.round(control.value * 100)}%</span>
      <Slider
        type="single"
        orientation="vertical"
        class="h-40"
        value={control.value}
        onValueChange={(next: number) => control.set(next)}
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
