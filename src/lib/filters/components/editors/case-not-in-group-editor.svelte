<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import type { CaseNotInGroupFilter } from "$lib/filters/kind/case-not-in-group";
  import type { Filter } from "$lib/filters/kind/filter";
  import { colorVar } from "$lib/format";
  import Users from "@lucide/svelte/icons/users";

  /**
   * Which Groups can be excluded is decided by the caller — the filter domain
   * knows nothing about Groups beyond the id it stores, and reaching into their
   * state here would point the dependency the wrong way.
   */
  let {
    initial = null,
    excludable,
    ondraft
  }: {
    initial?: CaseNotInGroupFilter | null;
    excludable: { id: string; name: string; color: string }[];
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  let groupId = $state<string>(seed?.groupId ?? "");

  $effect(() => {
    ondraft(groupId ? { kind: "case_not_in_group", groupId } : null);
  });
</script>

{#if excludable.length === 0}
  <Empty.Root class="py-6">
    <Empty.Header>
      <Empty.Media variant="icon">
        <Users />
      </Empty.Media>
      <Empty.Description>
        No other group to exclude yet. Create and apply a second group first.
      </Empty.Description>
    </Empty.Header>
  </Empty.Root>
{:else}
  <Field.Field>
    <Field.FieldLabel>Group to exclude</Field.FieldLabel>
    <RadioGroup.Root bind:value={groupId} class="gap-2">
      {#each excludable as option (option.id)}
        <div class="flex items-center gap-2">
          <RadioGroup.Item value={option.id} id="exclude-{option.id}" />
          <Label for="exclude-{option.id}" class="flex items-center gap-2 font-normal">
            <span
              class="size-2.5 shrink-0 rounded-full"
              style="background:{colorVar(option.color)}"
              aria-hidden="true"
            ></span>
            {option.name}
          </Label>
        </div>
      {/each}
    </RadioGroup.Root>
    <Field.FieldDescription>
      Keeps only the cases that are not in the selected group, so the two no longer overlap.
    </Field.FieldDescription>
  </Field.Field>
{/if}
