<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ImportedProject, ImportFailure, PreparedImport } from "$lib/project-import/types";
  import {
    cancelImport,
    importFailure,
    prepareImport,
    runImport
  } from "$lib/project-import/utils/import";
  import Copy from "@lucide/svelte/icons/copy";
  import FileArchive from "@lucide/svelte/icons/file-archive";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  type Step =
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "confirming"; prepared: PreparedImport }
    | { kind: "importing" }
    | { kind: "done"; imported: ImportedProject }
    | { kind: "failed"; failure: ImportFailure };

  let step = $state<Step>({ kind: "idle" });
  const busy = $derived(step.kind === "reading" || step.kind === "importing");

  async function pick(directory: boolean) {
    const path = await open(
      directory
        ? { directory: true, multiple: false }
        : { multiple: false, filters: [{ name: "Study file", extensions: ["zip"] }] }
    );
    if (!path) return;
    step = { kind: "reading" };
    try {
      const prepared = await prepareImport(path);
      if (prepared.replaces) step = { kind: "confirming", prepared };
      else await run(prepared);
    } catch (error) {
      step = { kind: "failed", failure: importFailure(error) };
    }
  }

  async function run(prepared: PreparedImport) {
    step = { kind: "importing" };
    try {
      step = { kind: "done", imported: await runImport(prepared) };
    } catch (error) {
      step = { kind: "failed", failure: importFailure(error) };
    }
  }

  function cancel() {
    step = { kind: "idle" };
    cancelImport();
  }
</script>

<Card.Root class="mt-6">
  <Card.Header>
    <Card.Title>Study</Card.Title>
    <Card.Description>
      Creates the study Project from the file the researcher shared: a zip file, or the folder it
      unzips into.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onclick={() => pick(false)}>
        <FileArchive data-icon="inline-start" />
        Import study Project
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onclick={() => pick(true)}>
        <FolderOpen data-icon="inline-start" />
        Pick a folder instead
      </Button>
    </div>

    {#if step.kind === "reading"}
      <p class="text-muted-foreground text-sm">Reading the study file.</p>
    {:else if step.kind === "done"}
      {@const { project, groups } = step.imported}
      <div class="border-border flex flex-col gap-1 border px-3 py-2 text-sm">
        <p class="font-medium">Imported "{project.name}".</p>
        <p class="text-muted-foreground">
          {project.cases.toLocaleString("en")} cases, {project.events.toLocaleString("en")} events,
          {groups} Groups.
        </p>
        <a class="underline underline-offset-4" href={`/app/projects/${project.id}`}>
          Open the Project
        </a>
      </div>
    {:else if step.kind === "failed"}
      {@const { sentence, detail } = step.failure}
      <div
        class="border-destructive/40 bg-destructive/10 text-destructive flex flex-col gap-2 border px-3 py-2 text-sm"
      >
        <p>{sentence}</p>
        <pre
          class="text-foreground max-h-40 overflow-auto text-xs whitespace-pre-wrap select-text">{detail}</pre>
        <div>
          <Button variant="outline" size="sm" onclick={() => navigator.clipboard.writeText(detail)}>
            <Copy data-icon="inline-start" />
            Copy details
          </Button>
        </div>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<AlertDialog.Root open={step.kind === "confirming"}>
  <AlertDialog.Content escapeKeydownBehavior="ignore">
    <AlertDialog.Header>
      <AlertDialog.Title>Replace the study Project?</AlertDialog.Title>
      <AlertDialog.Description>
        {#if step.kind === "confirming"}
          "{step.prepared.resolved.name}" already exists. Importing it again discards every change
          you made to it.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancel}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        onclick={() => step.kind === "confirming" && run(step.prepared)}
      >
        Replace
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={step.kind === "importing"}>
  <AlertDialog.Content escapeKeydownBehavior="ignore">
    <AlertDialog.Header>
      <AlertDialog.Title>Importing the study Project</AlertDialog.Title>
      <AlertDialog.Description class="flex items-center gap-2">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
        This can take a minute.
      </AlertDialog.Description>
    </AlertDialog.Header>
  </AlertDialog.Content>
</AlertDialog.Root>
