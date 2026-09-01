<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import type { Snippet } from "svelte";
  import type { Project } from "$lib/event-log/types";

  type ProjectView = "tree" | "distributions" | "statistics" | "data" | "filters";

  const viewLabels: Record<ProjectView, string> = {
    tree: "Directed Rooted Tree",
    distributions: "Distributions",
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

<header class="border-border bg-background flex h-10 shrink-0 items-center gap-2 border-b px-2">
  <Sidebar.Trigger class="cursor-pointer" />
  <Separator orientation="vertical" class="mr-1 h-4" />
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/app/projects">Projects</Breadcrumb.Link>
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
