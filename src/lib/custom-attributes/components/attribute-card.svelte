<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { isApplied } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { discardDraft, draftOf, isDirty } from "$lib/custom-attributes/state/drafts.svelte";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import { formatNumber } from "$lib/format";
  import Check from "@lucide/svelte/icons/check";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Undo2 from "@lucide/svelte/icons/undo-2";

  let {
    attribute,
    editing = false,
    onedit,
    onapply,
    onremove
  }: {
    attribute: CustomAttribute;
    editing?: boolean;
    onedit: (attribute: CustomAttribute) => void;
    onapply: (attribute: CustomAttribute) => void;
    onremove: (attribute: CustomAttribute) => void;
  } = $props();

  const draft = $derived(draftOf(attribute));
  const dirty = $derived(isDirty(attribute));
  const applied = $derived(isApplied(attribute));
</script>

<Card.Root class={editing ? "ring-primary ring-1" : ""}>
  <Card.Header>
    <Card.Title>
      <span class="flex items-center gap-2">
        <span class="text-primary font-mono text-xs font-bold" aria-hidden="true">ƒx</span>
        {draft.name}
        {#if dirty}
          <Badge variant="outline">Draft</Badge>
        {:else if !applied}
          <Badge variant="outline">Not applied</Badge>
        {/if}
      </span>
    </Card.Title>
    <Card.Description>
      {#if dirty}
        Unapplied edits. Views still read the last applied formula.
      {:else if !applied}
        Views cannot pick it until it is applied.
      {:else if attribute.emptyCount === 0}
        Event · Number · Every value was calculated.
      {:else}
        Event · Number · {formatNumber(attribute.emptyCount ?? 0)}
        {attribute.emptyCount === 1 ? "value" : "values"} could not be calculated and are empty.
      {/if}
    </Card.Description>
    <Card.Action>
      <div class="flex gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon-sm"
                onclick={() => onedit(attribute)}
                aria-label="Edit custom attribute"
              >
                <Pencil />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Edit custom attribute</Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon-sm"
                onclick={() => onremove(attribute)}
                class="hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 dark:hover:bg-destructive/20"
                aria-label="Delete custom attribute"
              >
                <Trash2 />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Delete custom attribute</Tooltip.Content>
        </Tooltip.Root>
      </div>
    </Card.Action>
  </Card.Header>

  <Card.Content>
    <p class="bg-muted px-3 py-2 font-mono text-xs break-all">{draft.formula}</p>
  </Card.Content>

  {#if dirty || !applied}
    <Card.Footer class="justify-end gap-2 border-t pt-4">
      {#if dirty}
        <Button variant="ghost" size="sm" onclick={() => discardDraft(attribute)}>
          <Undo2 data-icon="inline-start" />
          Discard
        </Button>
      {/if}
      <Button size="sm" onclick={() => onapply(attribute)}>
        <Check data-icon="inline-start" />
        Apply attribute
      </Button>
    </Card.Footer>
  {/if}
</Card.Root>
