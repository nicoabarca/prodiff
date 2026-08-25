<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { comparedGroups, view } from "$lib/tree/state/tree.svelte";

  const groups = $derived(comparedGroups());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  // Anything not one of the three case counts is an attribute name.
  const secondaryLabel = $derived(
    view.secondary === "cases"
      ? `Cases (${nameA} · ${nameB})`
      : view.secondary === "casesA"
        ? `Cases — ${nameA}`
        : view.secondary === "casesB"
          ? `Cases — ${nameB}`
          : `Mean ${view.secondary}`
  );

  const focusLabel = $derived(
    { all: "", a: `${nameA} only`, b: `${nameB} only`, shared: "Shared" }[view.focus]
  );

  const items = $derived(
    [
      view.direction === "TB" ? "Top → bottom" : "Left → right",
      secondaryLabel,
      focusLabel,
      view.edgeLabels ? "Transition time on edges" : "",
      view.significantOnly ? "Significant only" : "",
      view.collapsed.size > 0 ? `${view.collapsed.size} collapsed` : ""
    ].filter(Boolean)
  );
</script>

<div
  class="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[60%] flex-wrap items-center gap-1"
>
  {#each items as item (item)}
    <Badge variant="secondary" class="bg-background/90 backdrop-blur">{item}</Badge>
  {/each}
  <!-- The badge on a node is coloured, not just counted, so the ramp needs a
       key on the canvas itself — the panel's is behind a click. -->
  <Badge variant="secondary" class="bg-background/90 gap-1.5 backdrop-blur">
    Difference size
    <span class="flex items-center gap-px" aria-hidden="true">
      {#each [1, 2, 3, 4] as step (step)}
        <span class="size-2 rounded-full" style="background:var(--effect-{step})"></span>
      {/each}
    </span>
    <span class="text-muted-foreground">negligible → large</span>
  </Badge>
</div>
