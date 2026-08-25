<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { dependentsOf, removeGroup } from "$lib/groups/state/groups.svelte";
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  /**
   * Deleting cascades: a Group whose Filter List excludes this one cannot
   * outlive it, so the confirmation names every Group that will go with it
   * rather than refusing the delete.
   */
  let {
    group = $bindable(null),
    ondeleted
  }: { group?: Group | null; ondeleted?: (group: Group) => void } = $props();

  const dependents = $derived(group ? dependentsOf(group) : []);

  async function confirm() {
    const doomed = group;
    if (!doomed) return;
    group = null;
    await removeGroup(doomed.id);
    ondeleted?.(doomed);
  }
</script>

<AlertDialog.Root open={group !== null} onOpenChange={(next) => !next && (group = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete {group?.name}?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if dependents.length === 0}
          Its filters and its saved cases are removed. This cannot be undone.
        {:else}
          {dependents.length === 1 ? "One group excludes" : `${dependents.length} groups exclude`}
          this one, so {dependents.length === 1 ? "it is" : "they are"} deleted too. This cannot be undone.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    {#if dependents.length > 0}
      <ul class="flex flex-col gap-1.5">
        {#each dependents as dependent (dependent.id)}
          <li class="flex items-center gap-2 text-sm">
            <span
              class="size-2.5 shrink-0 rounded-full"
              style="background:{colorVar(dependent.color)}"
              aria-hidden="true"
            ></span>
            {dependent.name}
          </li>
        {/each}
      </ul>
    {/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirm}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
