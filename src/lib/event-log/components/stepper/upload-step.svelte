<script lang="ts">
  import { goto } from "$app/navigation";
  import { open } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Attachment from "$lib/components/ui/attachment/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { fetchEventLogFileSize } from "$lib/event-log/invokers/event-log-file-size";
  import UploadCloud from "@lucide/svelte/icons/upload-cloud";
  import FileUp from "@lucide/svelte/icons/file-up";
  import Table from "@lucide/svelte/icons/table";
  import X from "@lucide/svelte/icons/x";

  let { onAccepted }: { onAccepted: (filePath: string, fileName: string) => void } = $props();

  let hovering = $state(false);
  let dropError = $state<string | null>(null);
  let selectedFile = $state<{ path: string; name: string; size: number } | null>(null);
  let selectionVersion = 0;

  function formatFileSize(size: number): string {
    if (size < 1024) return `${size} B`;
    const units = ["KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)) - 1, units.length - 1);
    return `${(size / 1024 ** (unit + 1)).toLocaleString(undefined, {
      maximumFractionDigits: 1
    })} ${units[unit]}`;
  }

  async function acceptFile(path: string) {
    if (!path.toLowerCase().endsWith(".csv")) {
      dropError = "Only CSV event logs are supported.";
      return;
    }

    const version = ++selectionVersion;
    dropError = null;
    selectedFile = null;
    try {
      const size = await fetchEventLogFileSize(path);
      if (version !== selectionVersion) return;
      selectedFile = { path, name: path.split(/[/\\]/).pop() ?? path, size };
    } catch (error) {
      if (version !== selectionVersion) return;
      dropError = `Couldn't read this file: ${String(error)}`;
    }
  }

  async function chooseFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Event log", extensions: ["csv"] }]
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

  // Tauri's webview intercepts OS file drops, so DOM drop events never carry
  // paths: the drop is read off the webview's own event stream.
  $effect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          hovering = true;
        } else if (event.payload.type === "leave") {
          hovering = false;
        } else if (event.payload.type === "drop") {
          hovering = false;
          const paths = event.payload.paths;
          if (paths.length > 1) {
            dropError = "Drop a single event log, not several.";
          } else if (paths.length === 1) {
            acceptFile(paths[0]);
          }
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  });
</script>

<div class="mb-6 w-full text-center">
  <h1 class="font-heading text-xl font-bold tracking-tight">New project</h1>
  <p class="text-muted-foreground mt-1 text-sm text-pretty">
    Upload an event log to analyze. Files are parsed locally and never leave your device.
  </p>
</div>

{#if selectedFile}
  <Attachment.Root state="done" class="w-full">
    <Attachment.Media><Table /></Attachment.Media>
    <Attachment.Content>
      <Attachment.Title>{selectedFile.name}</Attachment.Title>
      <Attachment.Description>{formatFileSize(selectedFile.size)} · {selectedFile.path}</Attachment.Description>
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
      <Empty.Description>CSV</Empty.Description>
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
