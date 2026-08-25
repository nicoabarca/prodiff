<script lang="ts">
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { RequestColumnMapping } from "$lib/event-log/invokers/types";

  /**
   * Which column a filter reads. `color` is passed, not inherited: the dropdown
   * portals out of the editor's subtree, so `--accent-color` does not reach it.
   */
  let {
    columns,
    value,
    onselect,
    color,
    label = "Column",
    labelClass = "",
    class: className = ""
  }: {
    columns: RequestColumnMapping[];
    value: string;
    onselect: (name: string) => void;
    color: string;
    label?: string;
    labelClass?: string;
    class?: string;
  } = $props();
</script>

<Field.Field class={className}>
  <Field.FieldLabel for="filter-column" class={labelClass}>{label}</Field.FieldLabel>
  <Select.Root type="single" {value} onValueChange={onselect}>
    <Select.Trigger id="filter-column">{value || "Pick a column"}</Select.Trigger>
    <Select.Content style="--accent-color: {color}">
      <Select.Group>
        {#each columns as option (option.name)}
          <Select.Item
            value={option.name}
            label={option.name}
            class="[&_.cn-select-item-indicator-icon]:text-(--accent-color)"
          >
            {option.name}
          </Select.Item>
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
</Field.Field>
