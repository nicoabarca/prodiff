<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  /** `NONE` in the second slot shows the first Group alone. */
  const NONE = "";

  let {
    options,
    value,
    optional = false,
    label,
    onpick
  }: {
    options: Group[];
    value: Group | null;
    optional?: boolean;
    label: string;
    onpick: (id: string | null) => void;
  } = $props();
</script>

<Select.Root
  type="single"
  value={value?.id ?? NONE}
  onValueChange={(id) => onpick(id === NONE ? null : id)}
>
  <Select.Trigger size="sm" class="bg-background max-w-48 font-semibold" aria-label={label}>
    {#if value}
      <span class="size-2 shrink-0" style="background:{colorVar(value.color)}" aria-hidden="true"
      ></span>
      <span class="truncate">{value.name}</span>
    {:else}
      <span class="text-muted-foreground font-medium">Nothing</span>
    {/if}
  </Select.Trigger>
  <Select.Content>
    {#each options as group (group.id)}
      <Select.Item value={group.id} label={group.name}>
        <span class="size-2 shrink-0" style="background:{colorVar(group.color)}" aria-hidden="true"
        ></span>
        {group.name}
      </Select.Item>
    {/each}
    {#if optional}
      <Select.Item value={NONE} label="Nothing">Nothing</Select.Item>
    {/if}
  </Select.Content>
</Select.Root>
