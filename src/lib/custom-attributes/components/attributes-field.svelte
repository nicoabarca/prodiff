<script lang="ts">
  /**
   * Which attributes a view tests, as a toolbar field over the list to pick
   * from. Holds nothing: the view that opened it owns the selection and decides
   * when a change reaches its build, which is what `caption` and `note` say.
   */
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import AttributesList from "$lib/custom-attributes/components/attributes-list.svelte";
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
    <AttributesList {options} {selected} {note} {error} {onToggle} />
  </Popover.Content>
</Popover.Root>
