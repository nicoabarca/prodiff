<script lang="ts">
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Search from "@lucide/svelte/icons/search";

  /**
   * One checkable list of a column's values. The search term is the picker's
   * own — a filter kind that shows two lists gives each its own box, and
   * neither the term nor the filtering reaches the editor around it.
   */
  let {
    label,
    options,
    chosen,
    onchoose,
    truncated = false,
    error = null,
    limit,
    labelClass = ""
  }: {
    label: string;
    options: string[];
    chosen: string[];
    onchoose: (next: string[]) => void;
    truncated?: boolean;
    error?: string | null;
    /** How many values the fetch asked for, named in the truncation note. */
    limit: number;
    labelClass?: string;
  } = $props();

  let term = $state("");

  const listed = $derived(
    options.filter((v) => v.toLowerCase().includes(term.trim().toLowerCase()))
  );

  function toggled(value: string): string[] {
    return chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
  }
</script>

<Field.Field>
  <div class="flex items-center gap-2">
    <Field.FieldLabel class={labelClass}>{label}</Field.FieldLabel>
    <span class="text-muted-foreground ml-auto text-xs">
      {chosen.length}/{options.length} selected
    </span>
    <Button variant="ghost" size="xs" onclick={() => onchoose(listed)}>All</Button>
    <Button variant="ghost" size="xs" onclick={() => onchoose([])}>None</Button>
  </div>
  {#if options.length > 8}
    <InputGroup.Root>
      <InputGroup.Input placeholder="Search values…" bind:value={term} />
      <InputGroup.Addon>
        <Search />
      </InputGroup.Addon>
    </InputGroup.Root>
  {/if}
  {#if error}
    <Field.FieldError>{error}</Field.FieldError>
  {:else}
    <ScrollArea.Root class="border-border h-56 border">
      {#each listed as option (option)}
        <Label
          class="hover:bg-muted flex cursor-pointer items-center gap-2 px-2.5 py-1.5 font-normal"
        >
          <Checkbox
            checked={chosen.includes(option)}
            onCheckedChange={() => onchoose(toggled(option))}
            class="data-checked:text-background data-checked:border-(--accent-color) data-checked:bg-(--accent-color) dark:data-checked:bg-(--accent-color)"
          />
          <span class="truncate text-sm">{option}</span>
        </Label>
      {:else}
        <p class="text-muted-foreground px-2.5 py-3 text-xs">No matching values.</p>
      {/each}
    </ScrollArea.Root>
    {#if truncated}
      <Field.FieldDescription>
        Showing the first {limit} values alphabetically.
      </Field.FieldDescription>
    {/if}
  {/if}
</Field.Field>
