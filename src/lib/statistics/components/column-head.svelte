<script lang="ts">
  import type { Snippet } from "svelte";

  let { children, class: className = "" }: { children: Snippet; class?: string } = $props();
</script>

<div
  class="bg-sidebar text-muted-foreground flex items-center gap-3 px-4.5 py-1.75 text-[0.625rem] font-bold tracking-[0.06em] uppercase {className}"
>
  {@render children()}
</div>
