<script lang="ts">
  import { goto } from "$app/navigation";
  import { projects, projectsLoaded } from "$lib/event-log/state/projects.svelte";
  import type { Project } from "$lib/event-log/types";
  import ProjectCard from "$lib/event-log/components/card.svelte";
  import NewProjectCard from "$lib/event-log/components/new-project-card.svelte";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FolderKanban from "@lucide/svelte/icons/folder-kanban";
  import Plus from "@lucide/svelte/icons/plus";

  function openProject(project: Project) {
    goto(`/app/projects/${project.id}`);
  }
</script>

<h1 class="font-heading px-6 pt-8 pb-2 text-3xl font-bold tracking-tight">Projects</h1>

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
  <main class="min-h-0 w-full flex-1 overflow-auto px-6 py-6">
    <ul class="grid [grid-template-columns:repeat(auto-fill,22rem)] justify-start gap-3">
      {#each projects as project (project.id)}
        <ProjectCard {project} onOpen={openProject} />
      {/each}
      <NewProjectCard onclick={() => goto("/app/projects/new")} />
    </ul>
  </main>
{/if}
