<script lang="ts">
  import { goto } from "$app/navigation";
  import { open } from "@tauri-apps/plugin-dialog";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Attachment from "$lib/components/ui/attachment/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { formatFileSize } from "$lib/format";
  import { fetchEventLogFileSize } from "$lib/event-log/invokers/event-log-file-size";
  import {
    EVENT_LOG_DIALOG_EXTENSIONS,
    fileNameOf,
    isEventLogPath
  } from "$lib/event-log/utils/event-log-file";
  import { listenForFileDrop } from "$lib/event-log/utils/file-drop";
  import UploadCloud from "@lucide/svelte/icons/upload-cloud";
  import FileUp from "@lucide/svelte/icons/file-up";
  import Table from "@lucide/svelte/icons/table";
  import X from "@lucide/svelte/icons/x";

  let { onAccepted }: { onAccepted: (filePath: string, fileName: string) => void } = $props();

  let hovering = $state(false);
  let dropError = $state<string | null>(null);
  let selectedFile = $state<{ path: string; name: string; size: number } | null>(null);
  let selectionVersion = 0;

  async function acceptFile(path: string) {
    if (!isEventLogPath(path)) {
      dropError = "Only .csv, .xes and .xes.gz event logs are supported.";
      return;
    }

    const version = ++selectionVersion;
    dropError = null;
    selectedFile = null;
    try {
      const size = await fetchEventLogFileSize(path);
      if (version !== selectionVersion) return;
      selectedFile = { path, name: fileNameOf(path), size };
    } catch (error) {
      if (version !== selectionVersion) return;
      dropError = `Couldn't read this file: ${String(error)}`;
    }
  }

  async function chooseFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Event log", extensions: EVENT_LOG_DIALOG_EXTENSIONS }]
    });
    if (path) acceptFile(path);
  }

  function removeFile() {
    selectionVersion += 1;
    selectedFile = null;
    dropError = null;
  }

  function next() {
    if (selectedFile) onAccepted(selectedFile.path, selectedFile.name);
  }

  $effect(() =>
    listenForFileDrop({
      onHover: (value) => (hovering = value),
      onDrop: (paths) => {
        if (paths.length > 1) dropError = "Drop a single event log, not several.";
        else if (paths.length === 1) acceptFile(paths[0]);
      }
    })
  );
</script>

<div class="mb-6 w-full text-center">
  <h1 class="font-heading text-xl font-bold tracking-tight">New project</h1>
  <p class="text-muted-foreground mt-1 text-sm text-pretty">Upload an event log to analyze.</p>
</div>

{#if selectedFile}
  <Attachment.Root state="done" class="w-full">
    <Attachment.Media><Table /></Attachment.Media>
    <Attachment.Content>
      <Attachment.Title>{selectedFile.name}</Attachment.Title>
      <Attachment.Description
        >{formatFileSize(selectedFile.size)} · {selectedFile.path}</Attachment.Description
      >
    </Attachment.Content>
    <Attachment.Actions>
      <Attachment.Action aria-label={`Remove ${selectedFile.name}`} onclick={removeFile}>
        <X />
      </Attachment.Action>
    </Attachment.Actions>
  </Attachment.Root>
{:else}
  <Empty.Root
    class={`w-full flex-none border border-dashed py-12 transition-colors ${
      hovering ? "border-primary bg-primary/5" : "border-border"
    }`}
  >
    <Empty.Header>
      <Empty.Media variant="icon"><UploadCloud /></Empty.Media>
      <Empty.Title>{hovering ? "Drop to upload" : "Drag and drop your event log"}</Empty.Title>
      <Empty.Description>.csv, .xes and .xes.gz files are supported</Empty.Description>
    </Empty.Header>
    <Empty.Content>
      <Button onclick={chooseFile}>
        <FileUp data-icon="inline-start" />
        Choose file
      </Button>
    </Empty.Content>
  </Empty.Root>
{/if}

{#if dropError}
  <p
    class="border-destructive/40 bg-destructive/10 text-destructive mt-4 w-full border px-4 py-3 text-sm"
  >
    {dropError}
  </p>
{/if}

<div class="mt-4 flex w-full items-center justify-between gap-3">
  <Button variant="outline" onclick={() => goto("/app/projects")}>Cancel</Button>
  <Button disabled={!selectedFile} onclick={next}>Next</Button>
</div>
