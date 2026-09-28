<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { attributeOptions } from "$lib/analysis/attributes";
  import {
    attributeLabel,
    customColumns
  } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { saveSettings, settings } from "$lib/tree/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";
  import SettingField from "$lib/tree/components/setting-field.svelte";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const options = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );

  let draftAttributes = $state<string[] | null>(null);
  let saveError = $state<string | null>(null);

  const displayedAttributes = $derived(draftAttributes ?? settings.value.attributes);

  /** The first few attributes by name, the rest as a count. */
  const attributeList = $derived.by(() => {
    const SHOWN = 3;
    const names = displayedAttributes.slice(0, SHOWN).map(attributeLabel).join(", ");
    const more = displayedAttributes.length - SHOWN;
    return more > 0 ? `${names} +${more}` : names;
  });

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

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <SettingField
        {...props}
        icon={FlaskConical}
        caption="Attributes tested · rebuilds tree"
        {open}
        class="shrink"
      >
        {#if displayedAttributes.length > 0}
          {displayedAttributes.length}
          <span class="text-muted-foreground min-w-0 truncate font-normal">{attributeList}</span>
        {:else}
          None
        {/if}
      </SettingField>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <Label class="text-xs">Attributes to test</Label>
        <div class="flex flex-col gap-1.5">
          {#each options as name (name)}
            <label class="flex items-center gap-2 text-xs">
              <Checkbox
                checked={displayedAttributes.includes(name)}
                onCheckedChange={(checked) => toggle(name, checked === true)}
              />
              <span><AttributeName {name} /></span>
            </label>
          {:else}
            <p class="text-muted-foreground text-xs">
              This project has no attribute columns beyond the required fields.
            </p>
          {/each}
        </div>
        <p class="text-muted-foreground text-[0.625rem]">
          Each attribute is corrected within its own family, so adding one never weakens the
          findings of another. Unselected attributes are never tested. The tree rebuilds when this
          closes.
        </p>
        {#if saveError}
          <p class="text-destructive text-xs">Could not save build settings: {saveError}</p>
        {/if}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
