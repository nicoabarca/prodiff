<script lang="ts">
  import { goto } from "$app/navigation";
  import { projects, projectsLoaded } from "$lib/event-log/state/projects.svelte";
  import type { Project } from "$lib/event-log/types";
  import ProjectCard from "$lib/event-log/components/card.svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FolderKanban from "@lucide/svelte/icons/folder-kanban";
  import Plus from "@lucide/svelte/icons/plus";

  function openProject(project: Project) {
    goto(`/app/projects/${project.id}`);
  }
</script>

{#if projectsLoaded.value && projects.length === 0}
  <main class="flex min-h-0 w-full flex-1 items-center justify-center px-6 py-10">
    <Empty.Root class="max-w-md border-0">
      <Empty.Header>
        <Empty.Media variant="icon"><FolderKanban /></Empty.Media>
        <Empty.Title>No projects</Empty.Title>
        <Empty.Description>Create a new one to start analyzing an event log.</Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button onclick={() => goto("/app/projects/new")}>
          <Plus data-icon="inline-start" />
          New project
        </Button>
      </Empty.Content>
    </Empty.Root>
  </main>
{:else}
  <main class="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-auto px-6 py-10">
    <div class="border-border mb-8 flex items-end justify-between border-b pb-6">
      <div class="flex items-center gap-3">
        <div
          class="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center"
        >
          <FolderKanban class="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div>
          <h1 class="font-heading text-2xl font-bold tracking-tight">Projects</h1>
          <p class="text-muted-foreground mt-1 text-sm">
            {projects.length} event log{projects.length === 1 ? "" : "s"} on this device
          </p>
        </div>
      </div>
      <Button onclick={() => goto("/app/projects/new")}>
        <Plus data-icon="inline-start" />
        New project
      </Button>
    </div>

    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {#each projects as project (project.id)}
        <ProjectCard {project} onOpen={openProject} />
      {/each}
    </ul>
  </main>
{/if}
