<script lang="ts">
  /**
   * Picks the two Groups the tree compares, and reports what they share.
   *
   * Overlap is reported, never removed: taking the intersection out at event level
   * would fabricate traces no case walked. A Difference Group is the way out, and
   * is built from here.
   */
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import {
    applyGroup,
    createGroup,
    groups,
    isApplied,
    loadSharedCases,
    originalGroup,
    sharedCases
  } from "$lib/groups/state/groups.svelte";
  import { ORIGINAL_ID, type Group } from "$lib/groups/types";
  import { comparison, saveComparison } from "$lib/groups/state/comparison.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import Split from "@lucide/svelte/icons/split";

  let { project, open = $bindable(false) }: { project: Project; open?: boolean } = $props();

  /** Only applied Groups can be compared: an unapplied one has no cases on disk yet. */
  const options = $derived([originalGroup(project.id), ...groups.filter(isApplied)]);

  // Seeded from the saved comparison each time the dialog opens, so cancelling
  // leaves the tree on what it was already showing.
  /** What "compare against nothing" is called in the select, which has no empty value. */
  const NONE = "__none";

  let firstId = $state(ORIGINAL_ID);
  let secondId = $state(NONE);
  let building = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    firstId = comparison.groupIds[0] ?? ORIGINAL_ID;
    secondId = comparison.groupIds[1] ?? NONE;
    error = null;
  });

  const first = $derived(options.find((group) => group.id === firstId) ?? null);
  const second = $derived(options.find((group) => group.id === secondId) ?? null);

  const both = $derived(first && second ? [first, second] : null);
  const shared = $derived(both ? sharedCases(both) : null);

  $effect(() => {
    if (both) loadSharedCases(project, both);
  });

  const name = (id: string) =>
    id === NONE
      ? "Nothing, show one group"
      : (options.find((group) => group.id === id)?.name ?? "Pick a group");

  function apply() {
    saveComparison(project.id, second ? [firstId, secondId] : [firstId]);
    open = false;
  }

  /**
   * Builds the Difference Group and compares against it. The tree rebuilds on its
   * own while the new Group's Parquet is written.
   */
  async function compareDifference() {
    if (!both) return;
    const [baseline, other] = both;
    building = true;
    error = null;
    try {
      const filters: Filter[] = [
        ...other.filters,
        { kind: "case_not_in_group", groupId: baseline.id }
      ];
      const difference = await createGroup(
        project.id,
        filters,
        `${other.name} without ${baseline.name}`
      );
      await applyGroup(project, difference, filters);
      await saveComparison(project.id, [baseline.id, difference.id]);
      open = false;
    } catch (cause) {
      error = String(cause);
    } finally {
      building = false;
    }
  }
</script>

{#snippet picker(
  label: string,
  value: string,
  pick: (next: string) => void,
  exclude: string,
  allowNone = false
)}
  <div class="flex flex-col gap-1.5">
    <span class="text-muted-foreground text-xs">{label}</span>
    <Select.Root type="single" {value} onValueChange={pick}>
      <Select.Trigger class="w-full">{name(value)}</Select.Trigger>
      <Select.Content>
        {#if allowNone}
          <Select.Item value={NONE}>Nothing, show one group</Select.Item>
        {/if}
        {#each options.filter((group) => group.id !== exclude) as group (group.id)}
          <Select.Item value={group.id}>
            <span class="flex items-center gap-2">
              <span
                class="size-2.5 shrink-0 rounded-full"
                style="background:{colorVar(group.color)}"
                aria-hidden="true"
              ></span>
              {group.name}
            </span>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Compare groups</Dialog.Title>
      <Dialog.Description>
        Pick what the tree measures against. Only applied groups can be compared.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-3 sm:grid-cols-2">
      {@render picker("Group", firstId, (next) => (firstId = next), secondId)}
      {@render picker("Against", secondId, (next) => (secondId = next), firstId, true)}
    </div>

    {#if both}
      <div class="border-border flex flex-col gap-2 border p-3">
        {#if shared === null}
          <Skeleton class="h-4 w-48" />
        {:else if shared === 0}
          <p class="text-xs">
            No cases in both groups, so the two are independent. That is what the significance tests
            assume.
          </p>
        {:else}
          <p class="text-xs">
            <span class="font-semibold">{formatNumber(shared)} cases are in both groups.</span>
            Every p-value on the tree assumes they are independent samples, so shared cases make the findings
            optimistic.
          </p>
          <Button
            variant="outline"
            size="sm"
            class="self-start"
            disabled={building}
            onclick={compareDifference}
          >
            <Split data-icon="inline-start" />
            {building ? "Building…" : `Compare against ${second?.name} without those cases`}
          </Button>
          <p class="text-muted-foreground text-[0.6875rem]">
            Creates a group holding {second?.name}'s filters plus one excluding {first?.name}'s
            cases. It is an ordinary group afterwards, and is deleted with {first?.name}.
          </p>
        {/if}
      </div>
    {/if}

    {#if error}
      <p class="border-destructive/50 text-destructive border p-3 text-xs">{error}</p>
    {/if}

    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={building} onclick={apply}>Compare</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
