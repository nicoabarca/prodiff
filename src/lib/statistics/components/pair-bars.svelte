<script lang="ts">
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  let {
    groups,
    values,
    max
  }: { groups: Group[]; values: Record<string, number | null>; max: number } = $props();
</script>

<span class="flex flex-col gap-0.5" aria-hidden="true">
  {#each groups as group (group.id)}
    <span
      class="h-1.5"
      style="background:{colorVar(group.color)}; width:{max > 0
        ? Math.max(1, ((values[group.id] ?? 0) / max) * 100)
        : 1}%"
    ></span>
  {/each}
</span>
