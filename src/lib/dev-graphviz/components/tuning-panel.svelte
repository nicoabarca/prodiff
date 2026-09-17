<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import TuningPanel from "$lib/components/tuning-form/tuning-panel.svelte";
  import type { Tier, TuningField } from "$lib/components/tuning-form/types";
  import { resetTuning, saveTunings, tierOf, tunings } from "$lib/dev-graphviz/state/tuning.svelte";
  import { dotAttributes } from "$lib/dev-graphviz/utils/dot-attributes";
  import { view } from "$lib/dfg/state/view.svelte";
  import { dotSource } from "$lib/dfg/utils/layout-graphviz";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let { simplified }: { simplified: Simplified } = $props();

  const activeTier = $derived(tierOf(simplified));
  let tier = $state<Tier | null>(null);
  const editing = $derived(tier ?? activeTier);

  const fields: TuningField[] = [
    {
      kind: "choice",
      key: "splines",
      label: "splines",
      options: ["spline", "polyline", "ortho", "curved", "line"]
    },
    {
      kind: "choice",
      key: "edgeLabels",
      label: "Edge labels",
      options: ["label", "xlabel", "none"]
    },
    { kind: "choice", key: "weight", label: "Edge weight", options: ["count", "log", "flat"] },
    { kind: "choice", key: "ordering", label: "ordering", options: ["none", "out", "in"] },
    {
      kind: "range",
      key: "nodesep",
      label: "nodesep",
      min: 10,
      max: 300,
      step: 5,
      format: (v) => `${v}px`
    },
    {
      kind: "range",
      key: "ranksep",
      label: "ranksep",
      min: 10,
      max: 300,
      step: 5,
      format: (v) => `${v}px`
    },
    { kind: "range", key: "mclimit", label: "mclimit", min: 0.25, max: 10, step: 0.25 },
    { kind: "range", key: "searchsize", label: "searchsize", min: 5, max: 500, step: 5 },
    {
      kind: "range",
      key: "looseBelow",
      label: "constraint=false below",
      min: 0,
      max: 0.5,
      step: 0.005,
      format: (v) => `${(v * 100).toFixed(1)}% of busiest`
    },
    { kind: "toggle", key: "concentrate", label: "concentrate" },
    { kind: "toggle", key: "newrank", label: "newrank" },
    { kind: "toggle", key: "remincross", label: "remincross" },
    { kind: "toggle", key: "pinTerminals", label: "Start/End rank=source/sink" }
  ];

  function change(key: string, value: unknown) {
    (tunings[editing] as unknown as Record<string, unknown>)[key] = value;
    saveTunings();
  }
</script>

<TuningPanel
  title="Tune dot"
  id="dev-graphviz"
  {fields}
  values={tunings[editing] as unknown as Record<string, unknown>}
  {activeTier}
  bind:tier
  onChange={change}
  onReset={() => resetTuning(editing)}
>
  {#snippet actions({ copy, copied })}
    <Button
      variant="outline"
      size="sm"
      onclick={() =>
        copy(
          "dot",
          dotSource(simplified, view.direction, view.measure, dotAttributes(tunings[activeTier]))
        )}
    >
      {copied === "dot" ? "Copied" : "Copy DOT"}
    </Button>
    <Button
      variant="outline"
      size="sm"
      onclick={() => copy("json", JSON.stringify($state.snapshot(tunings), null, 2))}
    >
      {copied === "json" ? "Copied" : "Copy settings"}
    </Button>
  {/snippet}
</TuningPanel>
