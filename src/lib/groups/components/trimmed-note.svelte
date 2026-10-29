<script lang="ts">
  /**
   * Beside a Case attribute, names each compared Trimmed Group: its cases carry
   * the whole case's value, not one computed on the events it kept.
   */
  import { isCaseAttribute } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import { isTrimmed } from "$lib/groups/utils/trimmed";

  let {
    groups,
    attribute,
    class: className = ""
  }: { groups: Group[]; attribute: string; class?: string } = $props();

  const trimmed = $derived(
    isCaseAttribute(attribute) ? groups.filter((group) => isTrimmed(group.filters)) : []
  );
</script>

{#each trimmed as group (group.id)}
  <p class="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] {className}">
    <span class="size-2 shrink-0" style="background:{colorVar(group.color)}" aria-hidden="true"
    ></span>
    <span
      ><span class="text-foreground font-medium">{group.name}</span>: Case attributes are computed
      on whole cases.</span
    >
  </p>
{/each}
