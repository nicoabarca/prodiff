<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import AttributeCard from "$lib/custom-attributes/components/attribute-card.svelte";
  import AttributeEditor from "$lib/custom-attributes/components/attribute-editor.svelte";
  import DeleteAttributeDialog from "$lib/custom-attributes/components/delete-attribute-dialog.svelte";
  import {
    applyCustomAttribute,
    createCustomAttribute,
    customAttributes,
    removeCustomAttribute
  } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import {
    discardDraft,
    draftOf,
    setDraft,
    type CustomAttributeDraft
  } from "$lib/custom-attributes/state/drafts.svelte";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import type { Project } from "$lib/event-log/types";
  import Plus from "@lucide/svelte/icons/plus";
  import SquareFunction from "@lucide/svelte/icons/square-function";

  /**
   * `appliedGroupIds` are the Groups whose Parquet must gain the column, and
   * `blockersOf` names the Groups whose Filter Lists read an attribute. Both are
   * passed down because Groups sit above this domain.
   */
  let {
    project,
    appliedGroupIds,
    blockersOf
  }: {
    project: Project;
    appliedGroupIds: string[];
    blockersOf: (attribute: CustomAttribute) => { id: string; name: string; color: string }[];
  } = $props();

  /** Which attribute the editor is on. A null id is the attribute that does not exist yet. */
  let editing = $state<{ id: string | null } | null>(null);
  let deleting = $state<CustomAttribute | null>(null);
  let error = $state<string | null>(null);

  const editingAttribute = $derived(customAttributes.find((a) => a.id === editing?.id) ?? null);
  const blockers = $derived(deleting ? blockersOf(deleting) : []);

  async function save(draft: CustomAttributeDraft) {
    if (!editing) return;
    error = null;
    try {
      if (editingAttribute) setDraft(editingAttribute, draft);
      else await createCustomAttribute(project.id, draft);
      editing = null;
    } catch (cause) {
      error = String(cause);
    }
  }

  async function apply(attribute: CustomAttribute) {
    error = null;
    try {
      await applyCustomAttribute(project, attribute, draftOf(attribute), appliedGroupIds);
      discardDraft(attribute);
    } catch (cause) {
      error = String(cause);
    }
  }

  async function remove(attribute: CustomAttribute) {
    error = null;
    if (editing?.id === attribute.id) editing = null;
    try {
      await removeCustomAttribute(project, attribute, appliedGroupIds);
      discardDraft(attribute);
    } catch (cause) {
      error = String(cause);
    }
  }
</script>

<main class="bg-sidebar min-h-0 flex-1 overflow-auto p-5 lg:overflow-hidden">
  <!-- lg:items-stretch is load-bearing: with items-start the columns' lg:h-full resolves
       against their own content, so their overflow-auto never scrolls. -->
  <div class="grid w-full grid-cols-1 items-start gap-5 lg:h-full lg:grid-cols-2 lg:items-stretch">
    <!-- *:shrink-0 is load-bearing: flex children shrink by default, so a long list would
         squash each card instead of scrolling the column. -->
    <div class="flex flex-col gap-5 *:shrink-0 lg:h-full lg:min-h-0 lg:overflow-auto lg:px-px">
      <div>
        <h1 class="text-sm font-semibold">Custom attributes</h1>
        <p class="text-muted-foreground text-xs">
          Each one is a formula over the event log's visible number columns, calculated for every
          event. The graph, the tree, the data table and the filters can pick them like any other
          column. Edits are a draft until you apply them.
        </p>
      </div>

      {#if error}
        <p class="border-destructive/50 text-destructive border p-4 text-sm">{error}</p>
      {/if}

      {#if customAttributes.length === 0}
        <Empty.Root class="border-border bg-background border">
          <Empty.Header>
            <Empty.Media variant="icon">
              <SquareFunction />
            </Empty.Media>
            <Empty.Title>No custom attributes yet</Empty.Title>
            <Empty.Description>
              Combine number columns into a new one, such as a cost per day or a ratio of two
              amounts.
            </Empty.Description>
          </Empty.Header>
          <Empty.Content>
            <Button onclick={() => (editing = { id: null })}>
              <Plus data-icon="inline-start" />
              New custom attribute
            </Button>
          </Empty.Content>
        </Empty.Root>
      {:else}
        {#each customAttributes as attribute (attribute.id)}
          <AttributeCard
            {attribute}
            editing={editing?.id === attribute.id}
            onedit={(target) => (editing = { id: target.id })}
            onapply={apply}
            onremove={(target) => (deleting = target)}
          />
        {/each}

        <div class="flex justify-end">
          <Button variant="outline" size="sm" onclick={() => (editing = { id: null })}>
            <Plus data-icon="inline-start" />
            New custom attribute
          </Button>
        </div>
      {/if}
    </div>

    <div class="lg:h-full lg:min-h-0">
      <Card.Root class="lg:h-full">
        <Card.Header>
          <Card.Title>
            {editing === null
              ? "Configure custom attribute"
              : editingAttribute
                ? "Edit custom attribute"
                : "New custom attribute"}
          </Card.Title>
          <Card.Description>
            Formulas read visible number columns only. A column a formula reads cannot be hidden or
            retyped while the formula uses it.
          </Card.Description>
        </Card.Header>
        <Card.Content class="lg:min-h-0 lg:flex-1 lg:overflow-auto">
          {#if editing}
            {#key editing.id}
              <AttributeEditor
                {project}
                attribute={editingAttribute}
                draft={editingAttribute ? draftOf(editingAttribute) : { name: "", formula: "" }}
                onsave={save}
                oncancel={() => (editing = null)}
              />
            {/key}
          {:else}
            <Empty.Root class="py-8">
              <Empty.Header>
                <Empty.Media variant="icon">
                  <SquareFunction />
                </Empty.Media>
                <Empty.Description>
                  No attribute selected. Create one, or pick one to edit it.
                </Empty.Description>
              </Empty.Header>
            </Empty.Root>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</main>

<DeleteAttributeDialog bind:attribute={deleting} {blockers} onconfirm={remove} />
