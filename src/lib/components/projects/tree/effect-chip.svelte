<script lang="ts">
  /**
   * One attribute's Significance Test, said in one word. The magnitude leads —
   * at a few thousand cases per Group nearly every test comes out significant,
   * so "significant" on its own would mark almost everything — and the numbers
   * behind it sit in the tooltip for anyone checking the work.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { groupSlices } from "$lib/state/tree.svelte";
  import { effectBand, type Test } from "$lib/tree";

  let { test }: { test: Test | null | undefined } = $props();

  const groups = $derived(groupSlices());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  const band = $derived(test ? effectBand(test.effectSize) : null);
  const label = $derived(
    !test ? "" : !test.significant ? "no difference" : (band ?? "")
  );
  const strong = $derived(Boolean(test?.significant) && band !== "negligible");

  const detail = $derived.by(() => {
    if (!test) return "";
    const name = test.test === "chi2" ? "Chi-square" : "Mann-Whitney U";
    const effect = test.test === "chi2" ? "Cramér's V" : "rank-biserial r";
    const p = test.pValue < 0.001 ? test.pValue.toExponential(1) : test.pValue.toFixed(3);
    const direction =
      test.direction === "aHigher"
        ? ` · ${nameA} higher`
        : test.direction === "bHigher"
          ? ` · ${nameB} higher`
          : "";
    return `${name} · p = ${p}, corrected for the number of attributes tested · ${effect} ${test.effectSize.toFixed(2)}${direction}`;
  });
</script>

{#if test}
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Badge variant={strong ? "default" : "secondary"}>{label}</Badge>
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-64 text-[0.6875rem]">{detail}</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
