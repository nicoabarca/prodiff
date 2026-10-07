<script lang="ts">
  /**
   * Opens the measures table, and names what the graph is painting while it is
   * closed, so the measure is readable without opening anything.
   */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import { measureLabel } from "$lib/dfg/utils/measure";
  import Table2 from "@lucide/svelte/icons/table-2";

  let { open, onToggle }: { open: boolean; onToggle: () => void } = $props();
</script>

<SettingField
  icon={Table2}
  caption="Measures"
  chevron={false}
  {open}
  aria-pressed={open}
  class="shrink-0"
  data-tour="dfg-measures"
  onclick={onToggle}
>
  {measureLabel(view.measure)}
</SettingField>
