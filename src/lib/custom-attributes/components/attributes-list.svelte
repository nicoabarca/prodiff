<script lang="ts">
  /**
   * The attributes a view can test, as a checkbox each. Holds nothing: the view
   * that shows it owns the selection and decides when a change reaches its
   * build, which is what `note` says.
   */
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";

  let {
    options,
    selected,
    note,
    error = null,
    onToggle
  }: {
    options: string[];
    selected: string[];
    note: string;
    error?: string | null;
    onToggle: (name: string, on: boolean) => void;
  } = $props();
</script>

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
