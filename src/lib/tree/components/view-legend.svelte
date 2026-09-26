<script lang="ts">
  import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { view } from "$lib/tree/state/tree.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";

  const groups = $derived(comparedGroups());

  /** The Group a view setting names, or null when it names something else. */
  const named = (id: string) => groups.find((group) => group?.id === id)?.name ?? null;

  // Anything that is not `cases` or a Group id is an attribute name, shown the
  // same way the settings popover names it.
  const secondaryLabel = $derived(
    view.secondary === "cases"
      ? `Cases (${groups.map((group) => group.name).join(" · ")})`
      : (named(view.secondary) ?? `Mean ${attributeLabel(view.secondary)}`)
  );

  const focusLabel = $derived(
    view.focus === "all"
      ? ""
      : view.focus === "shared"
        ? "Shared"
        : `${named(view.focus) ?? "Group"} only`
  );

  const items = $derived(
    [
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
