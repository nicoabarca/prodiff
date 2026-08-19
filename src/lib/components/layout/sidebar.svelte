<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { Project } from "$lib/types";
  import Network from "@lucide/svelte/icons/network";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { activeProject }: { activeProject: Project | null } = $props();

  // In the order a project is worked through: look at the data, narrow it into
  // groups, then compare them.
  const projectNav = $derived([
    {
      href: activeProject ? `/app/projects/${activeProject.id}/statistics` : null,
      label: "Statistics & data",
      icon: BarChart3
    },
    {
      href: activeProject ? `/app/projects/${activeProject.id}/filters` : null,
      label: "Filters",
      icon: SlidersHorizontal
    },
    {
      href: activeProject ? `/app/projects/${activeProject.id}/tree` : null,
      label: "Comparison Directed Rooted Tree",
      icon: Network
    }
  ]);
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <div class="flex items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
      <div
        class="bg-sidebar-primary text-sidebar-primary-foreground flex h-7 w-7 items-center justify-center"
      >
        <Network class="h-4 w-4" aria-hidden="true" />
      </div>
      <span class="font-heading text-sm font-bold tracking-tight uppercase">compare</span>
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    {#if activeProject}
      <Sidebar.Group>
        <Sidebar.GroupLabel class="truncate">{activeProject.name}</Sidebar.GroupLabel>
        <Sidebar.Menu>
          {#each projectNav as { href, label, icon: Icon } (label)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                aria-disabled={!href}
                class={!href ? "pointer-events-none opacity-40" : "cursor-pointer"}
                isActive={href !== null && page.url.pathname === href}
                tooltipContent={label}
                onclick={() => href && goto(href)}
              >
                <Icon />
                <span>{label}</span>
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer class="group-data-[collapsible=icon]:hidden">
    <p class="text-muted-foreground px-2 text-[0.625rem] tracking-widest uppercase">
      Local analysis
    </p>
    <p class="text-muted-foreground px-2 text-xs">All data stays on device</p>
  </Sidebar.Footer>
</Sidebar.Root>
