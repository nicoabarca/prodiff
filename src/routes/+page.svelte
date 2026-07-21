<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
</script>

<main
  class="bg-background text-foreground flex min-h-screen flex-col items-center justify-center px-6"
>
  <div class="flex w-full max-w-sm flex-col items-center text-center">
    <div class="border-foreground flex size-14 items-center justify-center border">
      <div class="bg-primary size-5" aria-hidden="true"></div>
    </div>

    <h1 class="mt-8 text-4xl font-semibold tracking-tight text-balance">Welcome</h1>
    <p class="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
      A quiet place to start. No clutter, no noise — just your work.
    </p>

    <div class="mt-10 flex w-full flex-col">
      <Button size="lg" class="w-full" onclick={() => goto("/app/projects")}>
        Get started
        <ArrowRight data-icon="inline-end" />
      </Button>
      <Button variant="outline" size="lg" class="mt-3 w-full" onclick={() => goto("/app/projects")}>
        Open existing
      </Button>
    </div>

    <p class="text-muted-foreground mt-10 text-xs tracking-widest uppercase">Version 1.0.0</p>
  </div>
</main>
