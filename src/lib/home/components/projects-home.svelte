<script lang="ts">
  import { goto } from "$app/navigation";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { openedAt } from "$lib/event-log/state/opened.svelte";
  import { projects, projectsLoaded } from "$lib/event-log/state/projects.svelte";
  import type { Project } from "$lib/event-log/types";
  import { formatNumber } from "$lib/format";
  import FirstRun from "$lib/home/components/first-run.svelte";
  import ProjectCard from "$lib/home/components/project-card.svelte";
  import { loadRecords, recordsOf } from "$lib/home/state/overviews.svelte";
  import { finishWelcome, loadWelcome, welcome } from "$lib/home/state/welcome.svelte";
  import { shortCount } from "$lib/home/utils/format";
  import SampleProjectButton from "$lib/sample-project/components/sample-project-button.svelte";
  import { loadSampleVersion, sampleOutdated } from "$lib/sample-project/state/version.svelte";
  import { hasSampleProject } from "$lib/sample-project/utils/create";
  import FolderKanban from "@lucide/svelte/icons/folder-kanban";
  import Plus from "@lucide/svelte/icons/plus";

  loadSampleVersion();
  loadRecords();
  if (!welcome.loaded) loadWelcome();

  const sampleExists = $derived(hasSampleProject());
  const updateSample = $derived(sampleExists && sampleOutdated());

  $effect(() => {
    if (welcome.loaded && !welcome.done && projects.length > 0) finishWelcome();
  });

  const latestId = $derived.by(() => {
    let latest: string | null = null;
    for (const project of projects) {
      const opened = openedAt[project.id];
      if (opened && (!latest || opened > openedAt[latest])) latest = project.id;
    }
    return latest;
  });

  const totals = $derived([
    `${projects.length} ${projects.length === 1 ? "project" : "projects"}`,
    `${formatNumber(projects.reduce((sum, p) => sum + p.cases, 0))} cases`,
    `${shortCount(projects.reduce((sum, p) => sum + p.events, 0))} events`,
    `${projects.reduce((sum, p) => sum + recordsOf(p.id).groups.length, 0)} groups`
  ]);

  function openProject(project: Project) {
    goto(`/app/projects/${project.id}`);
  }
</script>

{#if !projectsLoaded.value || !welcome.loaded}
  <!-- Nothing to show until both the Projects and the first-run flag are read. -->
{:else if projects.length === 0 && !welcome.done}
  <FirstRun />
{:else}
  <header class="flex items-end justify-between gap-6 px-6 pt-8">
    <div class="flex flex-col gap-1.5">
      <h1 class="font-heading text-3xl font-bold tracking-tight">Projects</h1>
      {#if projects.length > 0}
        <p class="text-muted-foreground flex gap-2 text-xs">
          {#each totals as total, index (index)}
            {#if index > 0}<span aria-hidden="true">·</span>{/if}
            <span>{total}</span>
          {/each}
        </p>
      {/if}
    </div>
    {#if projects.length > 0}
      <div class="flex items-center gap-2">
        {#if !sampleExists || updateSample}
          <SampleProjectButton update={updateSample} />
        {/if}
        <Button onclick={() => goto("/app/projects/new")}>
          <Plus data-icon="inline-start" />
          New project
        </Button>
      </div>
    {/if}
  </header>

  {#if projects.length === 0}
    <main class="flex min-h-0 w-full flex-1 items-center justify-center px-6 py-10">
      <Empty.Root class="max-w-md border-0">
        <Empty.Header>
          <Empty.Media variant="icon"><FolderKanban /></Empty.Media>
          <Empty.Title>No projects</Empty.Title>
          <Empty.Description>
            Create a new one to start analyzing an event log, or explore ProDiff with a sample
            project.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content class="flex-row justify-center">
          <Button onclick={() => goto("/app/projects/new")}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
          <SampleProjectButton />
        </Empty.Content>
      </Empty.Root>
    </main>
  {:else}
    <main class="min-h-0 w-full flex-1 overflow-auto p-6">
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(23.75rem,1fr))] gap-3">
        {#each projects as project (project.id)}
          <ProjectCard {project} latest={project.id === latestId} onOpen={openProject} />
        {/each}
      </ul>
    </main>
  {/if}
{/if}
