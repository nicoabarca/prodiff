<script lang="ts">
  /**
   * Which attributes a view tests, as a toolbar field over the list to pick
   * from. Holds nothing: the view that opened it owns the selection and decides
   * when a change reaches its build, which is what `caption` and `note` say.
   */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";

  let {
    options,
    selected,
    caption,
    note,
    error = null,
    open = $bindable(false),
    onToggle
  }: {
    options: string[];
    selected: string[];
    caption: string;
    note: string;
    error?: string | null;
    open?: boolean;
    onToggle: (name: string, on: boolean) => void;
  } = $props();

  /** The first few attributes by name, the rest as a count. */
  const summary = $derived.by(() => {
    const SHOWN = 3;
    const names = selected.slice(0, SHOWN).map(attributeLabel).join(", ");
    const more = selected.length - SHOWN;
    return more > 0 ? `${names} +${more}` : names;
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <SettingField {...props} icon={FlaskConical} {caption} {open} class="shrink">
        {#if selected.length > 0}
          {selected.length}
          <span class="text-muted-foreground min-w-0 truncate font-normal">{summary}</span>
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
              checked={selected.includes(name)}
              onCheckedChange={(checked) => onToggle(name, checked === true)}
            />
            <span><AttributeName {name} /></span>
          </label>
        {:else}
          <p class="text-muted-foreground text-xs">
            This project has no attribute columns beyond the required fields.
          </p>
        {/each}
      </div>
      <p class="text-muted-foreground text-[0.625rem]">{note}</p>
      {#if error}
        <p class="text-destructive text-xs">Could not save build settings: {error}</p>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
