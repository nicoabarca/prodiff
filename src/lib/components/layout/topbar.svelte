<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import type { Project } from "$lib/types";
  import Home from "@lucide/svelte/icons/home";

  type ProjectView = "process-map" | "variants" | "statistics" | "data";

  const viewLabels: Record<ProjectView, string> = {
    "process-map": "Process map",
    variants: "Variants",
    statistics: "Statistics",
    data: "Data table"
  };

  let { project, projectView = "process-map" }: { project: Project; projectView?: ProjectView } =
    $props();
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
</header>
