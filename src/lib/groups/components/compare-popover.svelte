<script lang="ts">
  /**
   * The Compare popover: the Original and the project's Saved Comparisons, each
   * compared in one click, and an editor that is there only while a new draft
   * or a Saved Comparison is being edited. Two picked Groups show what the
   * comparison will remove before they are compared, and a pair that cannot be
   * compared is refused here.
   */
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import type { Project } from "$lib/event-log/types";
  import { comparedIds, saveComparison } from "$lib/groups/state/comparison.svelte";
  import { comparisonRelation } from "$lib/groups/invokers/comparison-relation";
  import type { ResponseRelation } from "$lib/groups/invokers/types";
  import { groups, isApplied, originalGroup } from "$lib/groups/state/groups.svelte";
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
  import { relationCopy, refusalCopy } from "$lib/groups/utils/comparison-note";
  import { colorVar } from "$lib/format";
  import { cn } from "$lib/utils";
  import Check from "@lucide/svelte/icons/check";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
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
  let busy = $state<"saving" | null>(null);
  let error = $state<string | null>(null);

  const selection = $derived(editor?.selection ?? null);
  const selected = $derived(
    selection?.kind === "saved" ? (listed.find((entry) => entry.id === selection.id) ?? null) : null
  );

  const first = $derived(editor ? (byId.get(editor.draft[0]) ?? null) : null);
  const second = $derived(editor ? (byId.get(editor.draft[1]) ?? null) : null);
  const both = $derived(first && second ? [first, second] : null);
  /** The picked pair's relation, tagged with the pair it was read for. */
  let pairRelation = $state<{ pair: string; summary: ResponseRelation } | null>(null);
  const pairKey = $derived(both ? both.map((group) => group.id).join("|") : null);
  const pairSummary = $derived(
    pairRelation && pairRelation.pair === pairKey ? pairRelation.summary : null
  );
  const pairRefused = $derived(pairSummary !== null && pairSummary.status !== "ok");

  $effect(() => {
    const pair = pairKey;
    const ids = both?.map((group) => group.id);
    if (!pair || !ids) return;
    comparisonRelation(project, ids)
      .then((summary) => {
        if (pairKey === pair) pairRelation = { pair, summary };
      })
      .catch((cause) => {
        if (pairKey === pair) error = String(cause);
      });
  });

  /** Why a Saved Comparison clicked just now could not be compared, by its id. */
  let savedRefusal = $state<{ id: string; reason: string } | null>(null);

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

  async function run(kind: "saving", task: () => Promise<void>) {
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
      savedRefusal = null;
      if (inUse?.id === saved.id) return onclose();
      if (saved.groupIds.length === 2) {
        const summary = await comparisonRelation(project, saved.groupIds);
        if (summary.status !== "ok") {
          savedRefusal = { id: saved.id, reason: refusalCopy(resolve(saved.groupIds), summary) };
          return;
        }
      }
      await saveComparison(project.id, saved.groupIds);
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
          {#if savedRefusal?.id === saved.id}
            <span class="text-destructive pl-3.5 text-[0.625rem] whitespace-normal">
              {savedRefusal.reason}
            </span>
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

    {#if both && !pairSummary}
      <Skeleton class="h-4 w-48" />
    {:else if both && pairSummary && pairRefused}
      <p class="border-destructive/50 text-destructive border p-3 text-xs">
        {refusalCopy(both, pairSummary)}
      </p>
    {:else if both && pairSummary}
      {@const outcome = relationCopy(both, pairSummary)}
      {#if outcome}
        <p class="border-border border p-3 text-xs">{outcome}</p>
      {:else}
        <p
          class="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        >
          <Check class="size-3.5 shrink-0" aria-hidden="true" />
          Groups don't share common cases
        </p>
      {/if}
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
        disabled={busy !== null || !first || (both !== null && (!pairSummary || pairRefused))}
        onclick={() => primary(draft, action)}
      >
        {ACTION_LABEL[action]}
      </Button>
    </div>
  </div>
{/if}
