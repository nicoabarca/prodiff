<script lang="ts">
  /**
   * Draws the graph once per Group, side by side. Only a comparison of two has
   * two panels to draw, so one Group on its own leaves the field disabled.
   */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { setSplit, splitting, view } from "$lib/dfg/state/view.svelte";
  import SplitIcon from "@lucide/svelte/icons/split";

  let { groupCount }: { groupCount: number } = $props();

  const available = $derived(groupCount === 2);
  const split = $derived(splitting(groupCount));
</script>

<SettingField
  icon={SplitIcon}
  caption={available ? "Split by group" : "Split · needs 2 groups"}
  chevron={false}
  open={split}
  disabled={!available}
  aria-pressed={split}
  class="shrink-0 disabled:pointer-events-none disabled:opacity-50"
  onclick={() => setSplit(!view.split)}
>
  {split ? "On" : "Off"}
</SettingField>
