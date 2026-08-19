<script lang="ts">
  import { page } from "$app/state";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from "$lib/components/layout/sidebar.svelte";
  import { projects, loadProjects } from "$lib/event-log/state/projects.svelte";

  let { children } = $props();

  // Collapsed to the icon rail on load — the analysis views want the width, and
  // the rail keeps every destination one click away. Toggling persists in a
  // cookie, so this only decides the first visit.
  let sidebarOpen = $state(false);

  loadProjects();

  const activeProject = $derived(
    page.params.id ? (projects.find((p) => p.id === page.params.id) ?? null) : null
  );
</script>

<div class="h-screen overflow-hidden">
  <!-- The trailing --sidebar-width wins over the provider's own default. -->
  <Sidebar.Provider
    bind:open={sidebarOpen}
    class="h-full min-h-0"
    style="--sidebar-width: 12.5rem;"
  >
    <AppSidebar {activeProject} />
    <Sidebar.Inset class="min-h-0">
      {@render children()}
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>
