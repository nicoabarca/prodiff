<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { attributeOptions } from "$lib/analysis/attributes";
  import { saveSettings, settings } from "$lib/tree/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";
  import Settings2 from "@lucide/svelte/icons/settings-2";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const options = $derived(attributeOptions(project.columns, project.hiddenColumns));

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

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm">
        <Settings2 data-icon="inline-start" />
        Build settings
        {#if displayedAttributes.length > 0}
          <span class="text-muted-foreground ml-1 font-mono text-[0.6875rem]">
            {displayedAttributes.length}
          </span>
        {/if}
      </Button>
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
              <span>{name}</span>
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
