<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils";
  import type { Project } from "$lib/event-log/types";
  import Network from "@lucide/svelte/icons/network";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { activeProject }: { activeProject: Project } = $props();

  const sidebar = Sidebar.useSidebar();

  // In the order a project is worked through: look at the data, narrow it into
  // groups, then compare them.
  const projectNav = $derived([
    {
      href: `/app/projects/${activeProject.id}/statistics`,
      label: "Statistics & data",
      icon: BarChart3
    },
    {
      href: `/app/projects/${activeProject.id}/filters`,
      label: "Filters",
      icon: SlidersHorizontal
    },
    {
      href: `/app/projects/${activeProject.id}/tree`,
      label: "Directed Rooted Tree",
      icon: Network
    }
  ]);

  const collapsed = $derived(!sidebar.open);
</script>

{#snippet brand(hoverable: boolean)}
  <div class="flex items-center gap-2">
    <div
      class={cn(
        "bg-sidebar-primary text-sidebar-primary-foreground group/logo flex size-7 shrink-0 items-center justify-center",
        hoverable
          ? "hover:text-sidebar-foreground cursor-pointer hover:bg-transparent"
          : "cursor-default"
      )}
    >
      <Network class={cn("size-4", hoverable && "group-hover/logo:hidden")} aria-hidden="true" />
      {#if hoverable}
        <PanelLeft class="hidden size-4 group-hover/logo:block" aria-hidden="true" />
      {/if}
    </div>
    <span
      class="font-heading text-sm font-bold tracking-tight uppercase group-data-[collapsible=icon]:hidden"
    >
      compare
    </span>
  </div>
{/snippet}

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <div
      class="flex items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      {#if collapsed}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button {...props} type="button" onclick={() => sidebar.toggle()}>
                {@render brand(true)}
                <span class="sr-only">Open sidebar</span>
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="right">Open sidebar</Tooltip.Content>
        </Tooltip.Root>
      {:else}
        {@render brand(false)}
      {/if}

      {#if !collapsed}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon-sm"
                class="ml-auto cursor-pointer"
                onclick={() => sidebar.toggle()}
                aria-label="Close sidebar"
              >
                <PanelLeft />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="right">Close sidebar</Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </div>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel class="truncate">{activeProject.name}</Sidebar.GroupLabel>
      <Sidebar.Menu>
        {#each projectNav as { href, label, icon: Icon } (label)}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              class="cursor-pointer"
              isActive={page.url.pathname === href}
              tooltipContent={label}
              onclick={() => goto(href)}
            >
              <Icon />
              <span>{label}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>
  </Sidebar.Content>
</Sidebar.Root>
