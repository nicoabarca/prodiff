<script lang="ts">
  /**
   * The shared Variants panel, staging against the graph's selection through
   * the Behaviour and Paths sliders.
   */
  import VariantPanel from "$lib/components/variant-panel/variant-panel.svelte";
  import VariantCuts from "$lib/dfg/components/variant-cuts.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import {
    applyCuts,
    isStagedDirty,
    loadVariants,
    resetCuts,
    selectedVariants,
    setStaged,
    shownVariant,
    stagedVariants,
    toggleStaged,
    variants
  } from "$lib/dfg/state/variants.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import type { Project } from "$lib/event-log/types";

  let {
    project,
    simplified,
    onClose
  }: { project: Project; simplified: Simplified | null; onClose: () => void } = $props();

  $effect(() => {
    loadVariants(project);
  });

  // A lit Variant belongs to the open panel, so closing it clears the highlight.
  $effect(() => () => {
    shownVariant.key = null;
  });

  const groups = $derived(comparedGroups());

  /** The Variants the graph was built from, which is what a row's eye can light. */
  const drawn = $derived(simplified ? simplified.variants.keys : new Set<string>());
</script>

<VariantPanel
  {groups}
  rows={variants.rows}
  loading={variants.loading}
  error={variants.error}
  dropped={variants.dropped}
  staged={stagedVariants()}
  applied={selectedVariants().size}
  dirty={isStagedDirty()}
  {drawn}
  highlighted={shownVariant.key}
  canvas="graph"
  onStage={setStaged}
  onToggle={toggleStaged}
  onHighlight={(key) => (shownVariant.key = shownVariant.key === key ? null : key)}
  onReset={resetCuts}
  onApply={() => applyCuts(project)}
  {onClose}
>
  {#snippet cuts()}
    <VariantCuts {groups} rows={variants.rows} staged={stagedVariants()} onStage={setStaged} />
  {/snippet}
</VariantPanel>
