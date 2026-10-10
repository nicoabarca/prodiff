<script lang="ts">
  /**
   * The Compare popover: the Original and the project's Saved Comparisons, each
   * compared in one click, and an editor that is there only while a new draft
   * or a Saved Comparison is being edited.
   *
   * Overlap is reported, never removed: taking the intersection out at event level
   * would fabricate traces no case walked. A Difference Group is the way out, and
   * is built from here.
   */
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
    ORIGINAL_ID,
    type ComparisonAction,
    type ComparisonDraft,
    type ComparisonSelection,
    type Group,
    type SavedComparison
  } from "$lib/groups/types";
  import {
    comparisonAction,
    draftGroupIds,
    sameGroupIds,
    saveTarget,
    savedMatching,
    toDraft
  } from "$lib/groups/utils/saved-comparisons";
  import { colorVar, formatNumber } from "$lib/format";
  import { cn } from "$lib/utils";
  import Check from "@lucide/svelte/icons/check";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
  import Split from "@lucide/svelte/icons/split";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let {
    project,
    editorSide = "right",
    onclose
  }: { project: Project; editorSide?: "left" | "right"; onclose: () => void } = $props();

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

  const original = $derived(originalGroup(project.id));
  const originalAlone = $derived(sameGroupIds(compared, [ORIGINAL_ID]));

  /** A new draft starts from what is compared, unless a Saved Comparison already holds that. */
  function editing(selection: ComparisonSelection): {
    selection: ComparisonSelection;
    draft: ComparisonDraft;
  } {
    const saved =
      selection.kind === "saved" ? listed.find((entry) => entry.id === selection.id) : undefined;
    return { selection, draft: toDraft(saved ? saved.groupIds : inUse ? [] : compared) };
  }

  let editor = $state<ReturnType<typeof editing> | null>(null);
  let busy = $state<"saving" | "building" | null>(null);
  let error = $state<string | null>(null);

  const selection = $derived(editor?.selection ?? null);
  const selected = $derived(
    selection?.kind === "saved" ? (listed.find((entry) => entry.id === selection.id) ?? null) : null
  );

  const first = $derived(editor ? (byId.get(editor.draft[0]) ?? null) : null);
  const second = $derived(editor ? (byId.get(editor.draft[1]) ?? null) : null);
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
    id === NO_GROUP ? "Select group" : (byId.get(id)?.name ?? "Pick a group");

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

  function primary(draft: ComparisonDraft, action: ComparisonAction) {
    return run("saving", async () => {
      const ids = draftGroupIds(draft);
      if (action === "save-and-compare") {
        const target = saveTarget(selected, draft, listed);
        if (target.kind === "create") await createSavedComparison(project.id, ids);
        if (target.kind === "update") await updateSavedComparison(target.id, ids);
      }
      if (action !== "comparing") await saveComparison(project.id, ids);
      onclose();
    });
  }

  /** Compares nothing: the views draw the Original on its own. */
  function showOriginal() {
    return run("saving", async () => {
      if (!originalAlone) await saveComparison(project.id, [ORIGINAL_ID]);
      onclose();
    });
  }

  function compare(saved: SavedComparison) {
    return run("saving", async () => {
      if (inUse?.id !== saved.id) await saveComparison(project.id, saved.groupIds);
      onclose();
    });
  }

  function remove() {
    return run("saving", async () => {
      if (!selected) return;
      await deleteSavedComparison(selected.id);
      editor = null;
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

{#snippet inUseMark()}
  <span class="text-primary flex items-center gap-1 pl-3.5 text-[0.625rem] font-semibold">
    <Check class="size-2.5" aria-hidden="true" />
    In use
  </span>
{/snippet}

{#snippet failure()}
  {#if error}
    <p class="border-destructive/50 text-destructive border p-3 text-xs">{error}</p>
  {/if}
{/snippet}

{#snippet picker(
  label: string,
  value: string,
  pick: (next: string) => void,
  exclude: string,
  allowNone = false
)}
  <div class="min-w-0 flex-1">
    <Select.Root type="single" {value} onValueChange={pick}>
      <Select.Trigger class="w-full min-w-0" aria-label={label}>
        {@const group = byId.get(value)}
        <span class="flex min-w-0 items-center gap-1.5">
          {#if group}
            {@render dot(group)}
          {/if}
          <span class={cn("truncate", value === NO_GROUP && "text-muted-foreground")}>
            {name(value)}
          </span>
        </span>
      </Select.Trigger>
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

<div
  class={cn(
    "border-border flex w-62 shrink-0 flex-col",
    editor && (editorSide === "left" ? "border-l" : "border-r")
  )}
>
  <button
    type="button"
    class="border-border hover:bg-accent flex cursor-pointer flex-col gap-0.5 border-b px-3 py-2 text-left disabled:pointer-events-none disabled:opacity-50"
    disabled={busy !== null}
    onclick={showOriginal}
  >
    <span class="flex min-w-0 items-center gap-1.5 font-medium">
      {@render dot(original)}
      <span class="truncate">{original.name}</span>
    </span>
    {#if originalAlone}
      {@render inUseMark()}
    {:else}
      <span class="text-muted-foreground pl-3.5 text-[0.625rem]">All cases, no groups</span>
    {/if}
  </button>
  <span
    class="text-muted-foreground px-3 pt-2.5 pb-1.5 text-[0.625rem] font-semibold tracking-wide"
  >
    Saved comparisons
  </span>
  <div class="flex max-h-72 flex-col overflow-y-auto pb-1">
    {#each listed as saved (saved.id)}
      {@const current = selection?.kind === "saved" && selection.id === saved.id}
      <div
        class={cn(
          "flex items-center border-l-2 border-transparent pr-1",
          current && "border-primary bg-accent"
        )}
      >
        <button
          type="button"
          aria-current={current}
          class="hover:bg-accent flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 py-1.75 pr-1.5 pl-2.5 text-left disabled:pointer-events-none disabled:opacity-50"
          disabled={busy !== null}
          onclick={() => compare(saved)}
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
            {@render inUseMark()}
          {/if}
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit comparison"
          onclick={() => (editor = editing({ kind: "saved", id: saved.id }))}
        >
          <Pencil />
        </Button>
      </div>
    {:else}
      <p class="text-muted-foreground px-3 py-2">No saved comparisons yet.</p>
    {/each}
  </div>
  {#if !editor}
    <div class="px-3 pb-2 empty:hidden">{@render failure()}</div>
  {/if}
  <div class="border-border mt-auto border-t p-1.5">
    <Button
      variant="ghost"
      size="sm"
      class={cn("w-full justify-start", selection?.kind === "new" && "bg-accent")}
      onclick={() => (editor = editing({ kind: "new" }))}
    >
      <Plus data-icon="inline-start" />
      New comparison
    </Button>
  </div>
</div>

{#if editor}
  {@const draft = editor.draft}
  {@const action = comparisonAction(selected, draft, compared)}
  <div class="flex w-88 max-w-full min-w-0 flex-col gap-3 p-3">
    <span class="truncate text-sm font-medium">{heading}</span>

    <div class="flex items-center gap-2">
      {@render picker(
        "Group",
        draft[0],
        (next) => (editor = { ...editor!, draft: [next, draft[1]] }),
        draft[1]
      )}
      <span class="text-muted-foreground shrink-0">vs</span>
      {#if options.length > 1}
        {@render picker(
          "Against",
          draft[1],
          (next) => (editor = { ...editor!, draft: [draft[0], next] }),
          draft[0],
          true
        )}
      {:else}
        <Button
          variant="outline"
          href={`/app/projects/${project.id}/filters`}
          class="min-w-0 flex-1 justify-start"
          onclick={onclose}
        >
          + Create a new group
        </Button>
      {/if}
    </div>

    {#if both && shared === 0}
      <p
        class="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
      >
        <Check class="size-3.5 shrink-0" aria-hidden="true" />
        Groups don't share common cases
      </p>
    {:else if both}
      <div class="border-border flex flex-col gap-2 border p-3">
        {#if shared === null}
          <Skeleton class="h-4 w-48" />
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
            Creates a group holding {second?.name}'s filters plus one excluding {first?.name}'s
            cases. It is an ordinary group afterwards, and is deleted with {first?.name}.
          </p>
        {/if}
      </div>
    {/if}

    {@render failure()}

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
        onclick={() => primary(draft, action)}
      >
        {ACTION_LABEL[action]}
      </Button>
    </div>
  </div>
{/if}
