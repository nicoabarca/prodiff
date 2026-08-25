<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { applyGroup, createGroup, groups } from "$lib/groups/state/groups.svelte";
  import {
    addToDraft,
    copyDraftFrom,
    discardDraft,
    draftOf,
    replaceInDraft
  } from "$lib/groups/state/drafts.svelte";
  import { colorVar } from "$lib/format";
  import type { Filter } from "$lib/filters/kind/filter";
  import FilterEditor from "$lib/filters/components/filter-editor.svelte";
  import DeleteGroupDialog from "$lib/groups/components/delete-group-dialog.svelte";
  import GroupCard from "$lib/groups/components/group-card.svelte";
  import GroupComparison from "$lib/groups/components/group-comparison.svelte";
  import type { Group } from "$lib/groups/types";
  import Plus from "@lucide/svelte/icons/plus";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  const project = $derived(currentProject());

  /** Which Group the editor is on, and which of its filters (null = new). */
  let editing = $state<{ groupId: string; index: number | null } | null>(null);
  let deleting = $state<Group | null>(null);
  let applyError = $state<string | null>(null);

  const editingGroup = $derived(groups.find((g) => g.id === editing?.groupId) ?? null);
  const editingDraft = $derived(editingGroup ? draftOf(editingGroup) : []);
  const editingFilter = $derived(
    editingGroup && editing?.index != null ? (editingDraft[editing.index] ?? null) : null
  );

  /** Filters that run before the one being edited. The editor measures its draft against them. */
  const precedingFilters = $derived(
    editing ? editingDraft.slice(0, editing.index ?? editingDraft.length) : []
  );

  /**
   * Every other Group, for the "not in group" kind. Passed down because the
   * filter domain sits below Groups and cannot read their state itself.
   */
  const excludable = $derived(
    groups
      .filter((group) => group.id !== editing?.groupId)
      .map(({ id, name, color }) => ({ id, name, color }))
  );

  function openEditor(group: Group, index: number | null) {
    editing = { groupId: group.id, index };
  }

  function saveFilter(filter: Filter) {
    if (!editingGroup || !editing) return;
    if (editing.index === null) addToDraft(editingGroup, filter);
    else replaceInDraft(editingGroup, editing.index, filter);
    editing = null;
  }

  async function apply(group: Group) {
    if (!project) return;
    applyError = null;
    try {
      await applyGroup(project, group, draftOf(group));
      discardDraft(group);
    } catch (cause) {
      applyError = String(cause);
    }
  }

  /** Copying replaces the old shared Base chain: similar Groups are made, not inherited. */
  async function copy(group: Group) {
    if (!project) return;
    const created = await createGroup(project.id, `${group.name} copy`);
    copyDraftFrom(group, created);
  }

  function afterDelete(group: Group) {
    if (editing?.groupId === group.id) editing = null;
  }
</script>

{#if project}
  <main class="bg-sidebar min-h-0 flex-1 overflow-auto p-5 lg:overflow-hidden">
    <div class="grid w-full grid-cols-1 items-start gap-5 lg:h-full lg:grid-cols-2">
      <div class="flex flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-auto lg:px-px">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h1 class="text-sm font-semibold">Filters</h1>
            <p class="text-muted-foreground text-xs">
              Each group is a set of cases its filters carve out of the event log, in order. Edits
              are a draft until you apply them.
            </p>
          </div>
        </div>

        {#if applyError}
          <p class="border-destructive/50 text-destructive border p-4 text-sm">{applyError}</p>
        {/if}

        {#if groups.length === 0}
          <Empty.Root class="border-border bg-background border">
            <Empty.Header>
              <Empty.Media variant="icon">
                <SlidersHorizontal />
              </Empty.Media>
              <Empty.Title>No groups yet</Empty.Title>
              <Empty.Description>
                Create a group to filter the event log down to the cases you want to compare.
              </Empty.Description>
            </Empty.Header>
            <Empty.Content>
              <Button onclick={() => createGroup(project.id)}>
                <Plus data-icon="inline-start" />
                New group
              </Button>
            </Empty.Content>
          </Empty.Root>
        {:else}
          <GroupComparison {groups} />
          {#each groups as group (group.id)}
            <GroupCard
              {project}
              {group}
              editingIndex={editing?.groupId === group.id ? editing.index : null}
              onedit={openEditor}
              onapply={apply}
              oncopy={copy}
              onremovegroup={(target) => (deleting = target)}
            />
          {/each}

          <div class="flex flex-wrap items-center justify-end gap-3">
            <Button variant="outline" size="sm" onclick={() => createGroup(project.id)}>
              <Plus data-icon="inline-start" />
              New group
            </Button>
          </div>
        {/if}
      </div>

      <div class="lg:h-full lg:min-h-0">
        <Card.Root class="lg:h-full">
          <Card.Header>
            <Card.Title>
              {editing === null
                ? "Configure filter"
                : editing.index === null
                  ? "Add filter"
                  : "Edit filter"}
            </Card.Title>
            <Card.Description>
              {#if editingGroup}
                In <span class="text-foreground font-medium">{editingGroup.name}</span>. Filters apply
                in order, each to the previous one's result.
              {:else}
                Pick “Add filter” on a group to configure one here.
              {/if}
            </Card.Description>
          </Card.Header>
          <Card.Content class="lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {#if editingGroup && editing}
              {#key `${editing.groupId}:${editing.index}`}
                <FilterEditor
                  {project}
                  filter={editingFilter}
                  precedingChain={precedingFilters}
                  color={colorVar(editingGroup.color)}
                  {excludable}
                  onsave={saveFilter}
                  oncancel={() => (editing = null)}
                />
              {/key}
            {:else}
              <Empty.Root class="py-8">
                <Empty.Header>
                  <Empty.Media variant="icon">
                    <SlidersHorizontal />
                  </Empty.Media>
                  <Empty.Description>
                    No filter selected. Add one to a group, or click a filter to edit it.
                  </Empty.Description>
                </Empty.Header>
              </Empty.Root>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  </main>

  <DeleteGroupDialog bind:group={deleting} ondeleted={afterDelete} />
{/if}
