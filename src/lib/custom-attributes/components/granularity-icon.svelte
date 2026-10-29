<script lang="ts">
  import type { ColumnScope } from "$lib/event-log/invokers/types";
  import { cn } from "$lib/utils";
  import Briefcase from "@lucide/svelte/icons/briefcase";
  import CircleDot from "@lucide/svelte/icons/circle-dot";

  let { scope, class: className }: { scope: ColumnScope; class?: string } = $props();

  const Icon = $derived(scope === "case" ? Briefcase : CircleDot);
</script>

<Icon class={cn("size-3 shrink-0", className)} aria-hidden="true" />
