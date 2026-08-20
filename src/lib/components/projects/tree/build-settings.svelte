<script lang="ts">
  /**
   * The one input to a build: which attributes get Significance Tests. It sits
   * next to the Build button because changing it invalidates the tree — how
   * many Variants are drawn is a view control, not this.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { attributeOptions } from "$lib/tree";
  import { saveSettings, settings } from "$lib/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";
  import Settings2 from "@lucide/svelte/icons/settings-2";

  let { project }: { project: Project } = $props();

  const options = $derived(attributeOptions(project.columns, project.hiddenColumns));

  function toggle(name: string, on: boolean) {
    const attributes = on
      ? [...settings.value.attributes, name]
      : settings.value.attributes.filter((a) => a !== name);
    saveSettings(project.id, { ...settings.value, attributes });
  }
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm">
        <Settings2 data-icon="inline-start" />
        Build settings
        {#if settings.value.attributes.length > 0}
          <span class="text-muted-foreground ml-1 font-mono text-[0.6875rem]">
            {settings.value.attributes.length}
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
                checked={settings.value.attributes.includes(name)}
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
          findings of another. Unselected attributes are never tested.
        </p>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
