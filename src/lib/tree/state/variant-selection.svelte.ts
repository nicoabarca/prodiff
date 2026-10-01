import { comparedIds } from "$lib/groups/state/comparison.svelte";
import { listVariants } from "$lib/tree/invokers/list-variants";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import { DEFAULT_COVERAGE } from "$lib/tree/types";
import { sameSelection, variantsCovering } from "$lib/tree/utils/variants";
import type { Project } from "$lib/event-log/types";

/**
 * What an empty persisted selection stands for. `"coverage"` means "not chosen
 * yet" and is re-seeded from `DEFAULT_COVERAGE` the first time the list loads;
 * `"all"` means every Variant and is left as it is.
 */
export type EmptySelection = "coverage" | "all";

export interface VariantSelectionOptions {
  applied: () => string[];
  persist: (project: Project, keys: string[]) => Promise<void>;
  onEmpty: EmptySelection;
}

/**
 * The Variant picker's state, one instance per view. The tree and the DFG both
 * build from a selection of Variants and edit it the same way: a staged copy
 * that only Apply writes through. Where it is persisted and what an empty
 * selection means are the options.
 */
export function createVariantSelection(options: VariantSelectionOptions) {
  /**
   * Every Variant of the current chains, for the panel. Cached by chain key,
   * fetched on first use. One slot.
   */
  const variants = $state<{
    key: string | null;
    rows: ResponseVariantRow[];
    loading: boolean;
    error: string | null;
    /** Selected Variants gone since the last load, for the panel to report. */
    dropped: number;
  }>({ key: null, rows: [], loading: false, error: null, dropped: 0 });

  /**
   * The Variant selection being edited, which nothing outside the panel reads:
   * `null` means no edit is pending and the applied selection stands. Only Apply
   * writes it through, so staging alone never rebuilds anything.
   */
  const staged = $state<{ keys: string[] | null }>({ keys: null });

  /** The Variant the canvas lights up: the row that turned it on turns it off. */
  const shownVariant = $state<{ key: string | null }>({ key: null });

  /** The Groups the Variant list would have to be built from to still be current. */
  function variantsKey(): string {
    return comparedIds().join("|");
  }

  function selectedVariants(): Set<string> {
    const explicit = options.applied();
    if (explicit.length === 0 && options.onEmpty === "all") {
      return new Set(variants.rows.map((row) => row.key));
    }
    return new Set(explicit);
  }

  /**
   * Loads the Variant list for the current chains, unless it is already in hand.
   * Keys absent under these chains are dropped and the rest kept.
   */
  async function loadVariants(project: Project, force = false) {
    const key = variantsKey();
    if (variants.loading || (!force && variants.key === key)) return;

    variants.loading = true;
    variants.error = null;
    try {
      const rows = await listVariants(project, comparedIds());
      variants.rows = rows;
      variants.key = key;

      const available = new Set(rows.map((row) => row.key));
      const previous = options.applied();
      const kept = previous.filter((variantKey) => available.has(variantKey));
      variants.dropped = previous.length - kept.length;
      const next =
        kept.length === 0 && options.onEmpty === "coverage"
          ? [...variantsCovering(rows, DEFAULT_COVERAGE)]
          : kept;
      if (next.length !== previous.length || next.some((k, i) => k !== previous[i])) {
        await options.persist(project, next);
      }
      // A pending edit is pruned the same way, so a Variant that no longer exists
      // leaves the rest of the edit standing.
      if (staged.keys !== null) staged.keys = staged.keys.filter((k) => available.has(k));
    } catch (cause) {
      variants.error = String(cause);
    } finally {
      variants.loading = false;
    }
  }

  function stagedVariants(): Set<string> {
    return staged.keys === null ? selectedVariants() : new Set(staged.keys);
  }

  /** Whether the staged selection differs from the one that is persisted. */
  function isStagedDirty(): boolean {
    return staged.keys !== null && !sameSelection(staged.keys, options.applied());
  }

  function setStaged(keys: Iterable<string>) {
    staged.keys = [...new Set(keys)];
  }

  /** Stages or unstages one Variant, opening an edit if none was pending. */
  function toggleStaged(variantKey: string) {
    const next = stagedVariants();
    if (!next.delete(variantKey)) next.add(variantKey);
    setStaged(next);
  }

  /** Drops the pending edit; the applied selection stands again. */
  function resetStaged() {
    staged.keys = null;
  }

  /** Commits the staged selection, which is what rebuilds the view. */
  async function applyStaged(project: Project) {
    if (staged.keys === null) return;
    const keys = staged.keys;
    staged.keys = null;
    await options.persist(project, keys);
  }

  function reset() {
    variants.key = null;
    variants.rows = [];
    variants.error = null;
    variants.dropped = 0;
    staged.keys = null;
    shownVariant.key = null;
  }

  return {
    variants,
    staged,
    shownVariant,
    selectedVariants,
    loadVariants,
    stagedVariants,
    isStagedDirty,
    setStaged,
    toggleStaged,
    resetStaged,
    applyStaged,
    reset
  };
}
