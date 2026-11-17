<script lang="ts">
  /**
   * The shared Variants panel, staging against the graph's selection. Picking
   * by hand and applying leaves the Behaviour slider at the coverage the
   * picked Variants hold.
   */
  import VariantPanel from "$lib/components/variant-panel/variant-panel.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import {
    applyPicked,
    isStagedDirty,
    loadVariants,
    resetStaged,
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
  onReset={resetStaged}
  onApply={() => applyPicked(project)}
  {onClose}
/>
