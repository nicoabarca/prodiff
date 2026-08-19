<script lang="ts">
  import { Card } from "$lib/components/ui/card/index.js";
  import Plus from "@lucide/svelte/icons/plus";

  let { onclick }: { onclick: () => void } = $props();
</script>

<li>
  <!--
    Dashed, unfilled and without the stat grid the real cards carry, so the one
    tile that is an action rather than a project reads as one at a glance.
  -->
  <button
    type="button"
    {onclick}
    class="h-full w-full cursor-pointer text-left"
    aria-label="New project"
  >
    <Card
      class="border-border hover:border-primary hover:shadow-primary/25 text-muted-foreground hover:text-primary flex h-full min-h-64 items-center justify-center gap-2 border border-dashed bg-transparent shadow-none transition-all hover:shadow-lg"
    >
      <Plus class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="font-heading text-sm font-semibold tracking-tight">New project</span>
    </Card>
  </button>
</li>
