<script lang="ts">
  /** Opens and closes the tests panel, and says how many tests came out significant. */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { tests } from "$lib/dfg/state/view.svelte";
  import type { Finding } from "$lib/dfg/utils/findings";
  import { formatNumber } from "$lib/format";
  import Sigma from "@lucide/svelte/icons/sigma";

  let { findings, groupCount }: { findings: Finding[]; groupCount: number } = $props();

  const significant = $derived(
    findings.filter((finding) => finding.block.test?.significant).length
  );
</script>

<SettingField
  icon={Sigma}
  caption="Tests"
  chevron={false}
  open={tests.open}
  aria-pressed={tests.open}
  class="shrink-0"
  data-tour="dfg-tests"
  onclick={() => (tests.open = !tests.open)}
>
  {#if groupCount < 2}
    Needs 2 groups
  {:else if findings.length === 0}
    No attributes
  {:else}
    {formatNumber(significant)} difference{significant === 1 ? "" : "s"}
  {/if}
</SettingField>
