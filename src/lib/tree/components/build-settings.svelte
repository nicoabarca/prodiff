<script lang="ts">
  /** The shared attributes field over the tree's build settings. */
  import AttributesField from "$lib/custom-attributes/components/attributes-field.svelte";
  import { attributeOptions } from "$lib/analysis/attributes";
  import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { saveSettings, settings } from "$lib/tree/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";

  const NOTE =
    "Each attribute is corrected within its own family, so adding one never weakens the findings of another. Unselected attributes are never tested. The tree rebuilds when this closes.";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const options = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );

  let draftAttributes = $state<string[] | null>(null);
  let saveError = $state<string | null>(null);

  const displayedAttributes = $derived(draftAttributes ?? settings.value.attributes);

  function toggle(name: string, on: boolean) {
    saveError = null;
    draftAttributes = on
      ? [...displayedAttributes, name]
      : displayedAttributes.filter((attribute) => attribute !== name);
  }

  async function commit(edited: string[]) {
    draftAttributes = null;
    const same =
      edited.length === settings.value.attributes.length &&
      edited.every((name) => settings.value.attributes.includes(name));
    if (same) return;
    try {
      await saveSettings(project.id, { ...settings.value, attributes: edited });
    } catch (cause) {
      saveError = String(cause);
      open = true;
    }
  }

  $effect(() => {
    if (!open && draftAttributes !== null) void commit(draftAttributes);
  });
</script>

<AttributesField
  {options}
  selected={displayedAttributes}
  caption="Attributes tested · rebuilds tree"
  note={NOTE}
  error={saveError}
  onToggle={toggle}
  bind:open
/>
