<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import type { Snippet } from "svelte";
  import type { Project } from "$lib/types";
  import Home from "@lucide/svelte/icons/home";

  type ProjectView = "tree" | "statistics" | "data" | "filters";

  const viewLabels: Record<ProjectView, string> = {
    tree: "Comparison Directed Rooted Tree",
    statistics: "Statistics & data",
    data: "Data table",
    filters: "Filters"
  };

  let {
    project,
    projectView = "statistics",
    actions
  }: { project: Project; projectView?: ProjectView; actions?: Snippet } = $props();
</script>

<header class="border-border bg-background flex h-14 shrink-0 items-center border-b px-4">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/app/projects" class="flex items-center gap-1.5">
          <Home class="h-3.5 w-3.5" aria-hidden="true" />
          Projects
        </Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{project.name}</Breadcrumb.Page>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{viewLabels[projectView]}</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>
  {#if actions}
    <div class="ml-auto flex items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</header>
