<script lang="ts">
  /**
   * The Behaviour and Paths sliders standing at the right of the canvas. A drag
   * only moves the thumb; letting it go is what changes the graph. Behaviour
   * rebuilds it from the most common Variants up to a share of the cases, so
   * every Significance Test is run on what is drawn. Paths hides the rarer
   * edges between activities of the graph on screen.
   */
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    cuts,
    selectedVariants,
    setBehaviour,
    setPaths,
    variants
  } from "$lib/dfg/state/variants.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import { stepCoverage, stepPaths } from "$lib/dfg/utils/cut";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import type { Project } from "$lib/event-log/types";
  import { formatNumber } from "$lib/format";
  import { casesShare, coverageFloor } from "$lib/tree/utils/variants";
  import Layers from "@lucide/svelte/icons/layers";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Spline from "@lucide/svelte/icons/spline";
  import type { Component } from "svelte";

  let {
    project,
    simplified,
    groups
  }: { project: Project; simplified: Simplified; groups: string[] } = $props();

  const rows = $derived(variants.rows);
  const floor = $derived(Math.min(100, coverageFloor(rows) * 100));
  const behaviour = $derived(cuts.coverage ?? casesShare(rows, selectedVariants()) * 100);

  let dragging = $state<{ behaviour: number | null; paths: number | null }>({
    behaviour: null,
    paths: null
  });

  function commitBehaviour(next: number) {
    dragging.behaviour = null;
    setBehaviour(project, Math.min(100, Math.max(floor, next)));
  }

  function commitPaths(next: number) {
    dragging.paths = null;
    setPaths(next);
  }

  const stepBehaviour = (step: 1 | -1) => commitBehaviour(stepCoverage(rows, behaviour, step));

  const stepEdges = (step: 1 | -1) =>
    commitPaths(stepPaths(simplified.folded, groups, cuts.paths, view.measure, step));

  const BUTTON =
    "text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 cursor-pointer items-center justify-center disabled:pointer-events-none disabled:opacity-40";
</script>

{#snippet cut(
  icon: Component,
  name: string,
  hint: string,
  value: number,
  min: number,
  disabled: boolean,
  more: boolean,
  onDrag: (value: number) => void,
  onCommit: (value: number) => void,
  onStep: (step: 1 | -1) => void
)}
  {@const Icon = icon}
  <div
    class="bg-background flex w-10 flex-col items-center gap-1 rounded-md border py-1.5 shadow-sm"
  >
    <Tooltip.Root>
      <Tooltip.Trigger
        class="text-muted-foreground hover:text-foreground flex size-6 cursor-help items-center justify-center"
        aria-label="What the {name} slider does"
      >
        <Icon class="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content side="left" class="max-w-64">
        <p class="font-medium">{name} · {Math.round(value)}%</p>
        <p>{hint}</p>
      </Tooltip.Content>
    </Tooltip.Root>
    <span class="text-muted-foreground font-mono text-[0.625rem] tabular-nums">
      {Math.round(value)}%
    </span>
    <button
      type="button"
      class={BUTTON}
      aria-label="More {name.toLowerCase()}"
      disabled={disabled || !more}
      onclick={() => onStep(1)}
    >
      <Plus class="size-3.5" />
    </button>
    <Slider
      type="single"
      orientation="vertical"
      class="data-vertical:min-h-32"
      aria-label={name}
      {value}
      {min}
      max={100}
      step={1}
      {disabled}
      onValueChange={onDrag}
      onValueCommit={onCommit}
    />
    <button
      type="button"
      class={BUTTON}
      aria-label="Less {name.toLowerCase()}"
      disabled={disabled || value <= min}
      onclick={() => onStep(-1)}
    >
      <Minus class="size-3.5" />
    </button>
  </div>
{/snippet}

<div class="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
  {@render cut(
    Layers,
    "Behaviour",
    "Builds the graph and its tests from the most common variants, up to this share of cases.",
    dragging.behaviour ?? behaviour,
    Math.floor(floor),
    rows.length === 0,
    selectedVariants().size < rows.length,
    (next) => (dragging.behaviour = next),
    commitBehaviour,
    stepBehaviour
  )}
  {@render cut(
    Spline,
    "Paths",
    "Shows this share of the busiest paths between activities. A hidden path and its tests leave the graph; every activity keeps its busiest way in and out.",
    dragging.paths ?? cuts.paths,
    0,
    simplified.folded.length === 0,
    simplified.hidden > 0,
    (next) => (dragging.paths = next),
    commitPaths,
    stepEdges
  )}
  {#if simplified.hidden > 0}
    <p
      class="bg-background/90 text-muted-foreground w-max rounded-sm border px-1.5 py-0.5 text-[0.625rem] tabular-nums shadow-sm"
    >
      {formatNumber(simplified.hidden)}
      {simplified.hidden === 1 ? "path" : "paths"} hidden
    </p>
  {/if}
</div>
