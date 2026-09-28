<script lang="ts">
  import { goto } from "$app/navigation";
  import { open } from "@tauri-apps/plugin-dialog";
  import { Button } from "$lib/components/ui/button/index.js";
  import Logo from "$lib/components/layout/logo.svelte";
  import { setPendingUpload } from "$lib/event-log/state/pending-upload.svelte";
  import {
    EVENT_LOG_DIALOG_EXTENSIONS,
    fileNameOf,
    isEventLogPath
  } from "$lib/event-log/utils/event-log-file";
  import { listenForFileDrop } from "$lib/event-log/utils/file-drop";
  import { SAMPLE_MANIFEST } from "$lib/sample-project/manifest";
  import { openNewSampleProject, sampleCreation } from "$lib/sample-project/state/creation.svelte";
  import { cn } from "$lib/utils";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import FileText from "@lucide/svelte/icons/file-text";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Network from "@lucide/svelte/icons/network";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Upload from "@lucide/svelte/icons/upload";

  const steps = [
    {
      icon: FileText,
      title: "Import and map columns",
      body: "Tell ProDiff which columns hold the case ID, activity and timestamp."
    },
    {
      icon: ChartColumn,
      title: "Explore statistics & data",
      body: "Check volumes and durations, add custom attributes from formulas."
    },
    {
      icon: SlidersHorizontal,
      title: "Define groups with filters",
      body: "Slice cases by attribute, duration, timeframe or path."
    },
    {
      icon: Network,
      title: "Compare them",
      body: "Directed Rooted Tree and Directly-Follows Graph show where the groups diverge."
    }
  ];

  let hovering = $state(false);
  let dropError = $state<string | null>(null);

  function start(path: string) {
    if (!isEventLogPath(path)) {
      dropError = "This file type isn't supported.";
      return;
    }
    setPendingUpload({ filePath: path, fileName: fileNameOf(path) });
    goto("/app/projects/new");
  }

  async function chooseFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Event log", extensions: EVENT_LOG_DIALOG_EXTENSIONS }]
    });
    if (path) start(path);
  }

  $effect(() =>
    listenForFileDrop({
      onHover: (value) => (hovering = value),
      onDrop: (paths) => {
        if (paths.length > 1) dropError = "Drop a single event log, not several.";
        else if (paths.length === 1) start(paths[0]);
      }
    })
  );
</script>

<div class="grid h-full min-h-0 grid-cols-2 overflow-auto">
  <section class="flex flex-col px-16 pt-14 pb-10">
    <div class="flex items-center gap-2">
      <Logo />
      <span class="font-heading text-sm font-bold tracking-tight uppercase">ProDiff</span>
    </div>
    <h1 class="font-heading mt-18 text-4xl leading-tight font-bold tracking-tight text-balance">
      See where two groups of cases run their process differently.
    </h1>
    <p class="text-muted-foreground mt-4 max-w-md text-sm/relaxed text-pretty">
      Start from an event log with a case ID, an activity and a timestamp. Everything else follows
      from it.
    </p>
    <ol class="border-border mt-10 flex flex-col border-t">
      {#each steps as step, index (step.title)}
        <li
          class="border-border grid grid-cols-[1.75rem_1.25rem_minmax(0,1fr)] items-start gap-3 border-b py-3.5"
        >
          <span class="text-muted-foreground font-mono text-xs/5">
            {String(index + 1).padStart(2, "0")}
          </span>
          <step.icon class="text-primary mt-0.5 size-4" aria-hidden="true" />
          <div class="flex flex-col gap-0.5">
            <span class="text-sm/5 font-medium">{step.title}</span>
            <span class="text-muted-foreground text-xs/normal">{step.body}</span>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <section
    class="bg-muted/50 border-border flex flex-col justify-center gap-4 border-l px-16 pt-14 pb-10"
  >
    <div
      class={cn(
        "bg-card flex h-90 flex-col items-center justify-center gap-3.5 border border-dashed text-center transition-all",
        hovering ? "border-primary shadow-primary/25 shadow-lg" : "border-foreground/25"
      )}
    >
      <div class="bg-muted flex size-10 items-center justify-center">
        <Upload class="size-5" aria-hidden="true" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="font-heading text-base font-semibold tracking-tight">
          {hovering ? "Drop to start a project" : "Drop an event log here"}
        </span>
        <span class="text-muted-foreground text-xs">.csv, .xes and .xes.gz files are supported</span
        >
      </div>
      <Button onclick={chooseFile}>
        <FolderOpen data-icon="inline-start" />
        Choose a file
      </Button>
    </div>

    {#if dropError}
      <p class="border-destructive/40 bg-destructive/10 text-destructive border px-4 py-3 text-sm">
        {dropError}
      </p>
    {/if}

    <div
      class="text-muted-foreground flex items-center gap-3 text-[0.6875rem] tracking-widest uppercase"
    >
      <span class="bg-border h-px flex-1"></span>or<span class="bg-border h-px flex-1"></span>
    </div>

    <button
      type="button"
      onclick={openNewSampleProject}
      disabled={sampleCreation.running}
      class="bg-card ring-foreground/10 hover:ring-primary flex cursor-pointer items-center gap-3.5 px-4 py-3.5 text-left ring-1 transition-all hover:ring-2 disabled:cursor-wait"
    >
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-medium">Explore the sample project</span>
        <span class="text-muted-foreground text-xs">
          Loan applications · {SAMPLE_MANIFEST.groups.length} groups already set up, with a tour of each
          view
        </span>
      </span>
      <span
        class="border-border bg-background flex h-8 shrink-0 items-center gap-1.5 border px-2.5 text-xs font-medium shadow-xs"
      >
        {#if sampleCreation.running}
          <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
          Creating…
        {:else}
          Open sample
          <ArrowRight class="size-3.5" aria-hidden="true" />
        {/if}
      </span>
    </button>
  </section>
</div>
