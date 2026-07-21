<script lang="ts">
  import { page } from "$app/state";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from "$lib/components/layout/sidebar.svelte";
  import { projects, loadProjects } from "$lib/state/projects.svelte";

  let { children } = $props();

  loadProjects();

  const activeProject = $derived(
    page.params.id ? (projects.find((p) => p.id === page.params.id) ?? null) : null
  );
</script>

<div class="h-screen overflow-hidden">
  <Sidebar.Provider class="h-full min-h-0">
    <AppSidebar {activeProject} />
    <Sidebar.Inset class="min-h-0">
      {@render children()}
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>
