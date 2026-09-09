<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import type { Snippet } from "svelte";
  import type { Project } from "$lib/event-log/types";

  type ProjectView = "tree" | "dfg" | "distributions" | "statistics" | "data" | "filters";

  const viewLabels: Record<ProjectView, string> = {
    tree: "Directed Rooted Tree",
    dfg: "Directly-Follows Graph",
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
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item class="ml-1">
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
