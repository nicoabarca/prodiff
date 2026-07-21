<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { projects } from "$lib/state/projects.svelte";
  import ProjectTopbar from "$lib/components/layout/topbar.svelte";
  import ViewPlaceholder from "$lib/components/layout/view-placeholder.svelte";
  import Network from "@lucide/svelte/icons/network";

  const project = $derived(projects.find((p) => p.id === page.params.id) ?? null);

  $effect(() => {
    if (!project) goto("/app/projects");
  });
</script>

{#if project}
  <ProjectTopbar {project} />
  <main class="min-h-0 flex-1 overflow-auto">
    <ViewPlaceholder
      icon={Network}
      title={project.name}
      description="The process map, variants, statistics, and data views for this project will live here."
    />
  </main>
{/if}
