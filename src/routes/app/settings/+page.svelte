<script lang="ts">
  import ImportStudyProject from "$lib/project-import/components/import-study-project.svelte";
  import ResetTours from "$lib/tour/components/reset-tours.svelte";
</script>

<h1 class="font-heading px-6 pt-8 pb-2 text-3xl font-bold tracking-tight">Settings</h1>

<main class="min-h-0 w-full max-w-2xl flex-1 overflow-auto px-6 py-6">
  <ResetTours />
  <ImportStudyProject />
</main>

<a
  href="/app/projects"
  class="text-muted-foreground/60 hover:text-muted-foreground fixed right-6 bottom-4 text-xs"
>
  Back to Projects
</a>
