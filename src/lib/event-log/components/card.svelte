<script lang="ts">
  import type { Project } from "$lib/event-log/types";
  import { removeProject } from "$lib/event-log/state/projects.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import FileText from "@lucide/svelte/icons/file-text";
  import CalendarRange from "@lucide/svelte/icons/calendar-range";
  import Clock from "@lucide/svelte/icons/clock";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let { project, onOpen }: { project: Project; onOpen: (project: Project) => void } = $props();

  function formatMonthYear(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  const timespan = $derived(
    project.timespanStart && project.timespanEnd
      ? `${formatMonthYear(project.timespanStart)} – ${formatMonthYear(project.timespanEnd)}`
      : "—"
  );
  const createdAt = $derived(project.createdAt.slice(0, 10));

  let deleteError = $state<string | null>(null);

  async function confirmDelete() {
    deleteError = null;
    try {
      await removeProject(project.id);
    } catch (err) {
      deleteError = String(err);
    }
  }
</script>

<li class="group relative">
  <div
    role="button"
    tabindex="0"
    class="block h-full w-full cursor-pointer text-left"
    onclick={() => onOpen(project)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(project);
      }
    }}
  >
    <Card.Root class="hover:bg-accent h-full transition-colors">
      <Card.Header>
        <Card.Title class="font-heading flex items-start justify-between text-base">
          {project.name}
          <ArrowRight class="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
        </Card.Title>
        <Card.Description class="flex items-center gap-1.5">
          <FileText class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{project.fileName}</span>
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <dl class="border-border grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">
          <div>
            <dt class="text-muted-foreground text-[0.625rem] tracking-widest uppercase">Cases</dt>
            <dd class="text-card-foreground font-medium">
              {project.cases.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground text-[0.625rem] tracking-widest uppercase">Events</dt>
            <dd class="text-card-foreground font-medium">
              {project.events.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground text-[0.625rem] tracking-widest uppercase">
              Activities
            </dt>
            <dd class="text-card-foreground font-medium">
              {project.activities.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground text-[0.625rem] tracking-widest uppercase">
              Variants
            </dt>
            <dd class="text-card-foreground font-medium">
              {project.variants.toLocaleString()}
            </dd>
          </div>
        </dl>
      </Card.Content>
      <Card.Footer
        class="border-border text-muted-foreground flex flex-col items-start gap-1.5 border-t pt-3 text-[0.6875rem]"
      >
        <span class="flex items-center gap-1.5">
          <CalendarRange class="h-3 w-3 shrink-0" aria-hidden="true" />
          {timespan}
        </span>
        <span class="flex items-center gap-1.5">
          <Clock class="h-3 w-3 shrink-0" aria-hidden="true" />
          Added {createdAt}
        </span>
      </Card.Footer>
    </Card.Root>
  </div>

  <div class="absolute right-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100">
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            size="icon"
            aria-label={`Delete ${project.name}`}
            class="border-border bg-background text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive h-7 w-7"
          >
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        {/snippet}
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete "{project.name}"?</AlertDialog.Title>
          <AlertDialog.Description>
            This permanently deletes the project's metadata and its files on disk (original upload +
            parsed event log). This cannot be undone.
          </AlertDialog.Description>
        </AlertDialog.Header>
        {#if deleteError}
          <p
            class="border-destructive/40 bg-destructive/10 text-destructive border px-3 py-2 text-sm"
          >
            Couldn't delete this project: {deleteError}
          </p>
        {/if}
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action variant="destructive" onclick={confirmDelete}>
            Delete
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </div>
</li>
