<script lang="ts">
  /** The shared attributes field over the graph's build settings. */
  import AttributesField from "$lib/custom-attributes/components/attributes-field.svelte";
  import { attributeOptions } from "$lib/analysis/attributes";
  import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import {
    selection,
    setAttributes,
    testedAttributes,
    toggleTested
  } from "$lib/dfg/state/dfg.svelte";
  import type { Project } from "$lib/event-log/types";

  const NOTE =
    "Each attribute is corrected within its own family, so adding one never weakens the findings of another. Unselected attributes are never tested, and the graph rebuilds on each change. Waiting Time is always measured: ticking it prints the wait on the edges.";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const options = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );

  // An attribute hidden or retyped out of the project leaves the selection.
  $effect(() => {
    const available = new Set(options);
    const kept = selection.attributes.filter((attribute) => available.has(attribute));
    if (kept.length !== selection.attributes.length) setAttributes(kept);
  });
</script>

<AttributesField
  {options}
  selected={testedAttributes()}
  caption="Attributes tested · rebuilds graph"
  note={NOTE}
  onToggle={toggleTested}
  bind:open
/>
