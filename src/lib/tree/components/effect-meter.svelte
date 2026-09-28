<script lang="ts">
  /** A test's magnitude as four steps on the `--effect-*` ramp, filled up to its band. */
  import type { Test } from "$lib/analysis/types";
  import { effectBand, effectStep } from "$lib/tree/utils/effect";

  let { test }: { test: Test | null | undefined } = $props();

  const step = $derived(test?.significant ? effectStep(test.effectSize) : 0);
</script>

<span
  class="flex gap-0.5"
  role="img"
  aria-label={step ? `Magnitude: ${effectBand(test!.effectSize)}` : "No magnitude"}
>
  {#each [1, 2, 3, 4] as i (i)}
    {#if i <= step}
      <span
        class="h-1.5 w-2.5 bg-(--fill) shadow-[inset_0_0_0_1px_var(--ink)]"
        style="--fill:var(--effect-{i});--ink:color-mix(in oklab, var(--effect-{i}-foreground) 25%, transparent)"
      ></span>
    {:else}
      <span class="bg-muted h-1.5 w-2.5 shadow-[inset_0_0_0_1px_var(--border)]"></span>
    {/if}
  {/each}
</span>
