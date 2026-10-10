<script lang="ts">
  /**
   * The Compare popover's two panes: the project's Saved Comparisons, and an
   * editor over the one selected. Selecting a row loads it into the editor
   * without comparing it; the primary button is the only thing that changes
   * what the views draw.
   *
   * Overlap is reported, never removed: taking the intersection out at event level
   * would fabricate traces no case walked. A Difference Group is the way out, and
   * is built from here.
   */
  import { untrack } from "svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import { comparedIds, saveComparison } from "$lib/groups/state/comparison.svelte";
  import {
    applyGroup,
    createGroup,
    groups,
    isApplied,
    loadSharedCases,
    originalGroup,
    sharedCases
  } from "$lib/groups/state/groups.svelte";
  import {
    createSavedComparison,
    deleteSavedComparison,
    savedComparisons,
    updateSavedComparison
  } from "$lib/groups/state/saved-comparisons.svelte";
  import {
    NO_GROUP,
    type ComparisonAction,
    type ComparisonDraft,
    type ComparisonSelection,
    type Group
  } from "$lib/groups/types";
  import {
    comparisonAction,
    draftGroupIds,
    initialSelection,
    saveTarget,
    savedMatching,
    selectionAfterDelete,
    toDraft
  } from "$lib/groups/utils/saved-comparisons";
  import { colorVar, formatNumber } from "$lib/format";
  import { cn } from "$lib/utils";
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import Split from "@lucide/svelte/icons/split";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let { project, onclose }: { project: Project; onclose: () => void } = $props();

  const ACTION_LABEL: Record<ComparisonAction, string> = {
    comparing: "Comparing",
    "save-and-compare": "Save & compare",
    compare: "Compare"
  };

  /** Only applied Groups can be compared: an unapplied one has no cases on disk yet. */
  const options = $derived([originalGroup(project.id), ...groups.filter(isApplied)]);
  const byId = $derived(new Map(options.map((group) => [group.id, group])));

  /** A Saved Comparison naming a Group that cannot be compared right now is not offered. */
  const listed = $derived(
    savedComparisons.filter(
      (saved) => saved.projectId === project.id && saved.groupIds.every((id) => byId.has(id))
    )
  );
  const compared = $derived(comparedIds());
  const inUse = $derived(savedMatching(listed, compared));

  /** A new draft starts from what is compared, unless a Saved Comparison already holds that. */
  function editing(selection: ComparisonSelection): {
    selection: ComparisonSelection;
    draft: ComparisonDraft;
  } {
    const saved =
      selection.kind === "saved" ? listed.find((entry) => entry.id === selection.id) : undefined;
    return { selection, draft: toDraft(saved ? saved.groupIds : inUse ? [] : compared) };
  }

  let editor = $state(untrack(() => editing(initialSelection(listed, compared))));
  let busy = $state<"saving" | "building" | null>(null);
  let error = $state<string | null>(null);

  const selection = $derived(editor.selection);
  const selected = $derived(
    selection.kind === "saved" ? (listed.find((entry) => entry.id === selection.id) ?? null) : null
  );
  const action = $derived(comparisonAction(selected, editor.draft, compared));

  const first = $derived(byId.get(editor.draft[0]) ?? null);
  const second = $derived(byId.get(editor.draft[1]) ?? null);
  const both = $derived(first && second ? [first, second] : null);
  const shared = $derived(both ? sharedCases(both) : null);

  $effect(() => {
    if (both) loadSharedCases(project, both);
  });

  const resolve = (ids: string[]): Group[] =>
    ids.map((id) => byId.get(id)).filter((group): group is Group => group !== undefined);

  const heading = $derived(
    selected
      ? resolve(selected.groupIds)
          .map((group) => group.name)
          .join(" vs ")
      : "New comparison"
  );

  const name = (id: string) =>
    id === NO_GROUP ? "Nothing, show one group" : (byId.get(id)?.name ?? "Pick a group");

  async function run(kind: "saving" | "building", task: () => Promise<void>) {
    busy = kind;
    error = null;
    try {
      await task();
    } catch (cause) {
      error = String(cause);
    } finally {
      busy = null;
    }
  }

  function primary() {
    return run("saving", async () => {
      const ids = draftGroupIds(editor.draft);
      if (action === "save-and-compare") {
        const target = saveTarget(selected, editor.draft, listed);
        if (target.kind === "create") await createSavedComparison(project.id, ids);
        if (target.kind === "update") await updateSavedComparison(target.id, ids);
      }
      if (action !== "comparing") await saveComparison(project.id, ids);
      onclose();
    });
  }

  function remove() {
    return run("saving", async () => {
      if (!selected) return;
      await deleteSavedComparison(selected.id);
      editor = editing(selectionAfterDelete(listed));
    });
  }

  /**
   * Builds the Difference Group, saves the pair and compares it. The views
   * rebuild on their own while the new Group's Parquet is written.
   */
  function compareDifference() {
    return run("building", async () => {
      if (!both) return;
      const [baseline, other] = both;
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
      const pair = [baseline.id, difference.id];
      await createSavedComparison(project.id, pair);
      await saveComparison(project.id, pair);
      onclose();
    });
  }
</script>

{#snippet dot(group: Group)}
  <span
    class="size-2 shrink-0 rounded-full"
    style="background:{colorVar(group.color)}"
    aria-hidden="true"
  ></span>
{/snippet}

{#snippet picker(
  label: string,
  value: string,
  pick: (next: string) => void,
  exclude: string,
  allowNone = false
)}
  <div class="flex min-w-0 flex-col gap-1.5">
    <span class="text-muted-foreground text-xs">{label}</span>
    <Select.Root type="single" {value} onValueChange={pick}>
      <Select.Trigger class="w-full">{name(value)}</Select.Trigger>
      <Select.Content>
        {#if allowNone}
          <Select.Item value={NO_GROUP}>Nothing, show one group</Select.Item>
        {/if}
        {#each options.filter((group) => group.id !== exclude) as group (group.id)}
          <Select.Item value={group.id}>
            <span class="flex items-center gap-2">
              {@render dot(group)}
              {group.name}
            </span>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
{/snippet}

<div class="border-border flex w-62 shrink-0 flex-col border-r">
  <span
    class="text-muted-foreground px-3 pt-2.5 pb-1.5 text-[0.625rem] font-semibold tracking-wide"
  >
    Saved comparisons
  </span>
  <div class="flex max-h-72 flex-col overflow-y-auto pb-1">
    {#each listed as saved (saved.id)}
      {@const current = selection.kind === "saved" && selection.id === saved.id}
      <button
        type="button"
        aria-current={current}
        class={cn(
          "hover:bg-accent flex cursor-pointer flex-col gap-0.5 border-l-2 border-transparent py-1.75 pr-3 pl-2.5 text-left",
          current && "border-primary bg-accent"
        )}
        onclick={() => (editor = editing({ kind: "saved", id: saved.id }))}
      >
        <span class="flex min-w-0 items-center gap-1.5 font-medium">
          {#each resolve(saved.groupIds) as group, i (group.id)}
            {#if i > 0}
              <span class="text-muted-foreground font-normal">vs</span>
            {/if}
            {@render dot(group)}
            <span class="truncate">{group.name}</span>
          {/each}
        </span>
        {#if inUse?.id === saved.id}
          <span class="text-primary flex items-center gap-1 pl-3.5 text-[0.625rem] font-semibold">
            <Check class="size-2.5" aria-hidden="true" />
            In use
          </span>
        {/if}
      </button>
    {:else}
      <p class="text-muted-foreground px-3 py-2">No saved comparisons yet.</p>
    {/each}
  </div>
  <div class="border-border mt-auto border-t p-1.5">
    <Button
      variant="ghost"
      size="sm"
      class={cn("w-full justify-start", selection.kind === "new" && "bg-accent")}
      onclick={() => (editor = editing({ kind: "new" }))}
    >
      <Plus data-icon="inline-start" />
      New comparison
    </Button>
  </div>
</div>

<div class="flex min-w-0 flex-1 flex-col gap-3 p-3">
  <span class="truncate text-sm font-medium">{heading}</span>

  <div class="grid grid-cols-2 gap-3">
    {@render picker(
      "Group",
      editor.draft[0],
      (next) => (editor.draft = [next, editor.draft[1]]),
      editor.draft[1]
    )}
    {@render picker(
      "Against",
      editor.draft[1],
      (next) => (editor.draft = [editor.draft[0], next]),
      editor.draft[0],
      true
    )}
  </div>

  <p class="text-muted-foreground text-[0.625rem]">
    Only applied Groups can be compared. Changing a side updates this saved pair.
  </p>

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
          Every p-value assumes independent samples, so shared cases make the findings optimistic.
        </p>
        <Button
          variant="outline"
          size="sm"
          class="h-auto min-h-7 self-start py-1 text-left whitespace-normal"
          disabled={busy !== null}
          onclick={compareDifference}
        >
          <Split data-icon="inline-start" />
          {busy === "building"
            ? "Building…"
            : `Compare against ${second?.name} without those cases`}
        </Button>
        <p class="text-muted-foreground text-[0.6875rem]">
          Creates a group holding {second?.name}'s filters plus one excluding {first?.name}'s cases.
          It is an ordinary group afterwards, and is deleted with {first?.name}.
        </p>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="border-destructive/50 text-destructive border p-3 text-xs">{error}</p>
  {/if}

  <div class="mt-auto flex items-center gap-2 pt-1">
    {#if selected}
      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={busy !== null}
        onclick={remove}
      >
        <Trash2 data-icon="inline-start" />
        Delete
      </Button>
    {/if}
    <Button
      size="sm"
      variant={action === "comparing" ? "secondary" : "default"}
      class="ml-auto"
      disabled={busy !== null || !first}
      onclick={primary}
    >
      {ACTION_LABEL[action]}
    </Button>
  </div>
</div>
