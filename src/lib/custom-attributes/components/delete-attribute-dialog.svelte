<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import { colorVar } from "$lib/format";

  /**
   * A Group whose Filter List reads the attribute would lose the column it
   * filters on, so the delete is refused until those filters are gone.
   * `blockers` are those Groups, applied or draft.
   */
  let {
    attribute = $bindable(null),
    blockers,
    onconfirm
  }: {
    attribute?: CustomAttribute | null;
    blockers: { id: string; name: string; color: string }[];
    onconfirm: (attribute: CustomAttribute) => void;
  } = $props();

  function confirm() {
    const doomed = attribute;
    attribute = null;
    if (doomed) onconfirm(doomed);
  }
</script>

<AlertDialog.Root open={attribute !== null} onOpenChange={(next) => !next && (attribute = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {blockers.length === 0 ? `Delete ${attribute?.name}?` : `${attribute?.name} is in use`}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if blockers.length === 0}
          Its formula and its column are removed from the event log and every group. This cannot be
          undone.
        {:else}
          {blockers.length === 1 ? "One group filters" : `${blockers.length} groups filter`} on this attribute.
          Remove those filters first, then delete it.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    {#if blockers.length > 0}
      <ul class="flex flex-col gap-1.5">
        {#each blockers as blocker (blocker.id)}
          <li class="flex items-center gap-2 text-sm">
            <span
              class="size-2.5 shrink-0 rounded-full"
              style="background:{colorVar(blocker.color)}"
              aria-hidden="true"
            ></span>
            {blocker.name}
          </li>
        {/each}
      </ul>
    {/if}
    <AlertDialog.Footer>
      {#if blockers.length === 0}
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action variant="destructive" onclick={confirm}>Delete</AlertDialog.Action>
      {:else}
        <AlertDialog.Cancel>Close</AlertDialog.Cancel>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
