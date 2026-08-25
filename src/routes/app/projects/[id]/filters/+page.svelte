<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import { applyGroup, createGroup, groups, removeGroup } from "$lib/groups/state/groups.svelte";
  import { colorVar } from "$lib/format";
  import type { Filter } from "$lib/filters/kind/filter";
  import FilterEditor from "$lib/filters/components/filter-editor.svelte";
  import GroupCard from "$lib/groups/components/group-card.svelte";
  import GroupComparison from "$lib/groups/components/group-comparison.svelte";
  import type { Group } from "$lib/groups/types";
  import Plus from "@lucide/svelte/icons/plus";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  const project = $derived(currentProject());

  /** Which Group the editor is on, and which of its filters (null = new). */
  let editing = $state<{ groupId: string; index: number | null } | null>(null);

  const editingGroup = $derived(groups.find((g) => g.id === editing?.groupId) ?? null);
  const editingFilter = $derived(
    editingGroup && editing?.index != null ? (editingGroup.filters[editing.index] ?? null) : null
  );

  /** Filters that run before the one being edited. The editor measures its draft against them. */
  const precedingFilters = $derived(
    editingGroup && editing
      ? editingGroup.filters.slice(0, editing.index ?? editingGroup.filters.length)
      : []
  );

  function openEditor(group: Group, index: number | null) {
    editing = { groupId: group.id, index };
  }

  async function saveFilter(filter: Filter) {
    if (!project || !editingGroup || !editing) return;
    const next = [...editingGroup.filters];
    if (editing.index === null) next.push(filter);
    else next[editing.index] = filter;
    await applyGroup(project, editingGroup, next);
    editing = null;
  }

  async function removeFilter(group: Group, index: number) {
    if (!project) return;
    if (editing?.groupId === group.id && editing.index === index) editing = null;
    await applyGroup(
      project,
      group,
      group.filters.filter((_, i) => i !== index)
    );
  }

  async function deleteGroup(group: Group) {
    if (editing?.groupId === group.id) editing = null;
    await removeGroup(group.id);
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
              Each group is a set of cases the event log's filters carve out, applied in order.
            </p>
          </div>
        </div>

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
              onremovefilter={removeFilter}
              onremovegroup={deleteGroup}
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
                In <span class="text-foreground font-medium">{editingGroup.name}</span> — filters apply
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
{/if}
