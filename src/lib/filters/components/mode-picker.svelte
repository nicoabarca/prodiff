<script lang="ts" generics="Mode extends string">
  import * as Field from "$lib/components/ui/field/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";

  /**
   * The mode of a filter: which lift from an event-level predicate to whole
   * cases the filter applies. Every kind has its own mode set, so the entries
   * and their copy come from the kind's own module.
   */
  let {
    entries,
    current,
    info,
    onselect
  }: {
    entries: readonly Mode[];
    current: Mode;
    info: Record<Mode, { label: string; description: string }>;
    onselect: (value: Mode) => void;
  } = $props();
</script>

<Field.FieldSet>
  <Field.FieldLegend>Mode</Field.FieldLegend>
  <RadioGroup.Root value={current} onValueChange={(next) => onselect(next as Mode)}>
    {#each entries as mode (mode)}
      <Field.Field orientation="horizontal">
        <RadioGroup.Item
          value={mode}
          id="mode-{mode}"
          class="[&_[data-slot=radio-group-indicator]_svg]:bg-background data-checked:border-(--accent-color) data-checked:bg-(--accent-color) dark:data-checked:bg-(--accent-color)"
        />
        <Field.FieldContent>
          <Field.FieldLabel for="mode-{mode}">{info[mode].label}</Field.FieldLabel>
          <Field.FieldDescription>{info[mode].description}</Field.FieldDescription>
        </Field.FieldContent>
      </Field.Field>
    {/each}
  </RadioGroup.Root>
</Field.FieldSet>
