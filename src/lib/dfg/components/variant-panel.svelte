<script lang="ts">
  /** The shared Variants panel, staging against the graph's selection. */
  import VariantPanel from "$lib/components/variant-panel/variant-panel.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import {
    applyStaged,
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

  /** The Variants the canvas is drawing, which the Behaviour cut narrows further. */
  const drawn = $derived(simplified ? simplified.variants.keys : new Set<string>());
</script>

<VariantPanel
  groups={comparedGroups()}
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
  onApply={() => applyStaged(project)}
  {onClose}
/>
