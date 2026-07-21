<script lang="ts">
  import { goto } from "$app/navigation";
  import { open } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import { draftUpload } from "$lib/state/projects.svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import UploadCloud from "@lucide/svelte/icons/upload-cloud";
  import FileUp from "@lucide/svelte/icons/file-up";

  let hovering = $state(false);
  let dropError = $state<string | null>(null);

  function acceptFile(path: string) {
    if (!path.toLowerCase().endsWith(".csv")) {
      dropError = "Only CSV event logs are supported.";
      return;
    }
    dropError = null;
    draftUpload.filePath = path;
    draftUpload.fileName = path.split(/[/\\]/).pop() ?? path;
    goto("/app/projects/new/mapping");
  }

  async function chooseFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Event log", extensions: ["csv"] }]
    });
    if (path) acceptFile(path);
  }

  // Tauri's webview intercepts OS file drops, so DOM drop events never carry
  // paths — the drop has to be read off the webview's own event stream.
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

<main
  class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center overflow-auto px-6 py-10"
>
  <div class="mb-6 w-full text-center">
    <h1 class="font-heading text-xl font-bold tracking-tight">New project</h1>
    <p class="text-muted-foreground mt-1 text-sm text-pretty">
      Upload an event log to analyze. Files are parsed locally and never leave your device.
    </p>
  </div>

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

  {#if dropError}
    <p
      class="border-destructive/40 bg-destructive/10 text-destructive mt-4 w-full border px-4 py-3 text-sm"
    >
      {dropError}
    </p>
  {/if}

  <div class="mt-4 flex w-full items-center justify-between gap-3">
    <p class="text-muted-foreground text-xs text-pretty">
      After upload you'll map columns to the required process mining fields — a project is created
      once mapping is confirmed.
    </p>
    <Button variant="outline" onclick={() => goto("/app/projects")}>Cancel</Button>
  </div>
</main>
