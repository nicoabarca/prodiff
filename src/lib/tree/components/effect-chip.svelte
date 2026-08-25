<script lang="ts">
  /** One attribute's Significance Test, said in one word. */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { comparedGroups } from "$lib/tree/state/tree.svelte";
  import type { Test } from "$lib/tree/invokers/types";
  import { effectBand, effectStep } from "$lib/tree/utils/effect";

  let { test }: { test: Test | null | undefined } = $props();

  const groups = $derived(comparedGroups());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  const band = $derived(test ? effectBand(test.effectSize) : null);
  const label = $derived(!test ? "" : !test.significant ? "no difference" : (band ?? ""));
  // A failed test has no magnitude to place on the ramp, so it stays neutral.
  const step = $derived(test?.significant ? effectStep(test.effectSize) : null);

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
        {#if step}
          <Badge
            class="border-(--ink)/20 bg-(--fill) text-(--ink)"
            style="--fill:var(--effect-{step});--ink:var(--effect-{step}-foreground)"
          >
            {label}
          </Badge>
        {:else}
          <Badge variant="secondary">{label}</Badge>
        {/if}
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-64 text-[0.6875rem]">{detail}</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
{/if}
