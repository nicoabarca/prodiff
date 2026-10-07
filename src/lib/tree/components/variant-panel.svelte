<script lang="ts">
  /** The shared Variants panel, staging against the tree's selection. */
  import VariantPanel from "$lib/components/variant-panel/variant-panel.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import {
    applyStaged,
    isStagedDirty,
    loadVariants,
    resetStaged,
    setStaged,
    settings,
    shownVariant,
    stagedVariants,
    toggleStaged,
    variants,
    view
  } from "$lib/tree/state/tree.svelte";
  import { visibleNodes } from "$lib/tree/utils/tree";
  import type { Project } from "$lib/event-log/types";

  let {
    project,
    tree,
    onClose
  }: { project: Project; tree: ResponseDirectedTree | null; onClose: () => void } = $props();

  $effect(() => {
    loadVariants(project);
  });

  // A lit Variant belongs to the open panel, so closing it clears the highlight.
  $effect(() => () => {
    shownVariant.key = null;
  });

  /** The Variants the canvas is drawing, which is what a row's eye can light. */
  const drawn = $derived.by(() => {
    if (!tree) return new Set<string>();
    const visible = visibleNodes(tree, view, new Set(settings.value.selectedVariants));
    return new Set(
      tree.nodes
        .filter((node) => node.variantKey !== null && visible.ids.has(node.id))
        .map((node) => node.variantKey as string)
    );
  });
</script>

<VariantPanel
  groups={comparedGroups()}
  rows={variants.rows}
  loading={variants.loading}
  error={variants.error}
  dropped={variants.dropped}
  staged={stagedVariants()}
  applied={settings.value.selectedVariants.length}
  dirty={isStagedDirty()}
  {drawn}
  highlighted={shownVariant.key}
  canvas="tree"
  onStage={setStaged}
  onToggle={toggleStaged}
  onHighlight={(key) => (shownVariant.key = shownVariant.key === key ? null : key)}
  onReset={resetStaged}
  onApply={() => applyStaged(project)}
  {onClose}
/>
