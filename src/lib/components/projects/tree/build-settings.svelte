<script lang="ts">
  /**
   * The inputs to a build: which attributes get Significance Tests, and how
   * much of the log to cover. Both live next to the Build button because both
   * invalidate the tree — nothing here changes what is already on screen.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { attributeOptions } from "$lib/tree";
  import { saveSettings, settings } from "$lib/state/tree.svelte";
  import type { Project } from "$lib/types";
  import Settings2 from "@lucide/svelte/icons/settings-2";

  let { project }: { project: Project } = $props();

  const options = $derived(attributeOptions(project.columns, project.hiddenColumns));

  function toggle(name: string, on: boolean) {
    const attributes = on
      ? [...settings.value.attributes, name]
      : settings.value.attributes.filter((a) => a !== name);
    saveSettings(project.id, { ...settings.value, attributes });
  }

  function setCoverage(percent: number) {
    const coverage = Math.min(100, Math.max(1, percent)) / 100;
    saveSettings(project.id, { ...settings.value, coverage });
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

      <div class="flex flex-col gap-1.5">
        <Label class="text-xs" for="coverage">Case coverage (%)</Label>
        <Input
          id="coverage"
          type="number"
          min="1"
          max="100"
          class="h-8 text-xs"
          value={Math.round(settings.value.coverage * 100)}
          onchange={(event) => setCoverage(Number(event.currentTarget.value))}
        />
        <p class="text-muted-foreground text-[0.625rem]">
          The fewest variants covering this share of the two groups' cases. Relative to the log, so
          a clean log keeps almost everything and a messy one drops its long tail.
        </p>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
