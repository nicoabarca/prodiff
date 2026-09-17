<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import TuningPanel from "$lib/components/tuning-form/tuning-panel.svelte";
  import type { Tier, TuningField } from "$lib/components/tuning-form/types";
  import { resetTuning, saveTunings, tierOf, tunings } from "$lib/dev-elk/state/tuning.svelte";
  import {
    CROSSING_MINIMIZATIONS,
    CYCLE_BREAKINGS,
    EDGE_ROUTINGS,
    LAYERINGS,
    MODEL_ORDERS,
    NODE_PLACEMENTS
  } from "$lib/dev-elk/types";
  import { elkOptions } from "$lib/dev-elk/utils/elk-options";
  import type { Simplified } from "$lib/dfg/utils/simplify";

  let { simplified }: { simplified: Simplified } = $props();

  const activeTier = $derived(tierOf(simplified));
  let tier = $state<Tier | null>(null);
  const editing = $derived(tier ?? activeTier);

  const px = (value: number) => `${value}px`;
  const spacing = (key: string, label: string): TuningField => ({
    kind: "range",
    key,
    label,
    min: 0,
    max: 300,
    step: 5,
    format: px
  });

  const fields: TuningField[] = [
    { kind: "choice", key: "edgeRouting", label: "edgeRouting", options: EDGE_ROUTINGS },
    spacing("nodeNodeBetweenLayers", "spacing.nodeNodeBetweenLayers"),
    spacing("edgeNodeBetweenLayers", "spacing.edgeNodeBetweenLayers"),
    spacing("edgeEdgeBetweenLayers", "spacing.edgeEdgeBetweenLayers"),
    spacing("nodeNode", "spacing.nodeNode"),
    spacing("edgeNode", "spacing.edgeNode"),
    spacing("edgeEdge", "spacing.edgeEdge"),
    { kind: "range", key: "thoroughness", label: "thoroughness", min: 1, max: 100, step: 1 },
    {
      kind: "choice",
      key: "crossingMinimization",
      label: "crossingMinimization",
      options: CROSSING_MINIMIZATIONS
    },
    { kind: "choice", key: "nodePlacement", label: "nodePlacement", options: NODE_PLACEMENTS },
    { kind: "choice", key: "layering", label: "layering", options: LAYERINGS },
    { kind: "choice", key: "cycleBreaking", label: "cycleBreaking", options: CYCLE_BREAKINGS },
    {
      kind: "choice",
      key: "considerModelOrder",
      label: "considerModelOrder",
      options: MODEL_ORDERS
    },
    {
      kind: "toggle",
      key: "favorStraightEdges",
      label: "nodePlacement.favorStraightEdges"
    },
    { kind: "toggle", key: "mergeEdges", label: "mergeEdges" },
    { kind: "toggle", key: "separateConnectedComponents", label: "separateConnectedComponents" }
  ];

  const values = $derived(tunings[editing] as unknown as Record<string, unknown>);

  function change(key: string, value: unknown) {
    (tunings[editing] as unknown as Record<string, unknown>)[key] = value;
    saveTunings();
  }
</script>

<TuningPanel
  title="Tune ELK"
  id="dev-elk"
  {fields}
  {values}
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
        copy("options", JSON.stringify(elkOptions($state.snapshot(tunings[activeTier])), null, 2))}
    >
      {copied === "options" ? "Copied" : "Copy layoutOptions"}
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
