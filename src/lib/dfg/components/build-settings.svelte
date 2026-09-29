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
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { selection, setAttributes } from "$lib/dfg/state/dfg.svelte";
  import type { Project } from "$lib/event-log/types";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  const options = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );

  $effect(() => {
    const available = new Set(options);
    const kept = selection.attributes.filter((attribute) => available.has(attribute));
    if (kept.length !== selection.attributes.length) setAttributes(kept);
  });

  /** The first few attributes by name, the rest as a count. */
  const attributeList = $derived.by(() => {
    const SHOWN = 3;
    const names = selection.attributes.slice(0, SHOWN).map(attributeLabel).join(", ");
    const more = selection.attributes.length - SHOWN;
    return more > 0 ? `${names} +${more}` : names;
  });

  function toggle(name: string) {
    const next = new Set(selection.attributes);
    if (!next.delete(name)) next.add(name);
    setAttributes([...next]);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <SettingField
        {...props}
        icon={FlaskConical}
        caption="Attributes tested · rebuilds graph"
        {open}
        class="shrink"
      >
        {#if selection.attributes.length > 0}
          {selection.attributes.length}
          <span class="text-muted-foreground min-w-0 truncate font-normal">{attributeList}</span>
        {:else}
          None
        {/if}
      </SettingField>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80">
    <div class="flex flex-col gap-2">
      <Label class="text-xs">Attributes to test</Label>
      <div class="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {#each options as name (name)}
          <label class="flex items-center gap-2 text-xs">
            <Checkbox
              checked={selection.attributes.includes(name)}
              onCheckedChange={() => toggle(name)}
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
        Each attribute is corrected within its own family, so adding one never weakens the findings
        of another. Unselected attributes are never tested. The graph rebuilds on each change.
      </p>
    </div>
  </Popover.Content>
</Popover.Root>
