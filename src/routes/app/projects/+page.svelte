<script lang="ts">
  import { goto } from "$app/navigation";
  import { projects, projectsLoaded } from "$lib/state/projects.svelte";
  import type { Project } from "$lib/types";
  import ProjectCard from "$lib/components/projects/card.svelte";
  import NewProjectCard from "$lib/components/projects/new-project-card.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FolderKanban from "@lucide/svelte/icons/folder-kanban";
  import Plus from "@lucide/svelte/icons/plus";

  function openProject(project: Project) {
    goto(`/app/projects/${project.id}`);
  }
</script>

<!--
  The list has no breadcrumb of its own, but it still needs somewhere to put the
  sidebar toggle, which every other view keeps in its topbar.
-->
<header class="border-border bg-background flex h-10 shrink-0 items-center gap-2 border-b px-2">
  <Sidebar.Trigger class="cursor-pointer" />
  <Separator orientation="vertical" class="mr-1 h-4" />
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Page>Projects</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>
</header>

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
