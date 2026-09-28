<script lang="ts">
  import type { Project } from "$lib/event-log/types";
  import { removeProject } from "$lib/event-log/state/projects.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let { project }: { project: Project } = $props();

  let deleteError = $state<string | null>(null);

  async function confirmDelete() {
    deleteError = null;
    try {
      await removeProject(project.id);
    } catch (err) {
      deleteError = String(err);
    }
  }
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        size="icon"
        aria-label={`Delete ${project.name}`}
        class="border-border bg-background text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive size-7"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    {/snippet}
  </AlertDialog.Trigger>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete "{project.name}"?</AlertDialog.Title>
      <AlertDialog.Description>
        This permanently deletes the project's metadata and its files on disk (original upload +
        parsed event log). This cannot be undone.
      </AlertDialog.Description>
    </AlertDialog.Header>
    {#if deleteError}
      <p class="border-destructive/40 bg-destructive/10 text-destructive border px-3 py-2 text-sm">
        Couldn't delete this project: {deleteError}
      </p>
    {/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={confirmDelete}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
