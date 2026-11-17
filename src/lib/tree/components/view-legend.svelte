<script lang="ts">
  /**
   * What the marks on the canvas mean, one drawing and one sentence per mark,
   * behind a button beside the zoom controls. It follows the Display settings:
   * a row appears only while its mark is drawn. It stays open until toggled, so
   * those settings can be changed with it in view.
   */
  import type { Snippet } from "svelte";
  import { TRANSITION_TIME, isDurationAttribute } from "$lib/analysis/attributes";
  import { Button } from "$lib/components/ui/button/index.js";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { shade } from "$lib/groups/utils/shade";
  import FigureName from "$lib/tree/components/figure-name.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { selectedVariants, view } from "$lib/tree/state/tree.svelte";
  import { hasSignificant } from "$lib/tree/utils/effect";
  import { figureAttributes, nodeFigure, type NodeFigure } from "$lib/tree/utils/figure";
  import { isDivergent, visibleNodes } from "$lib/tree/utils/tree";
  import { cn } from "$lib/utils";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Info from "@lucide/svelte/icons/info";
  import Split from "@lucide/svelte/icons/split";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  // Svelte Flow's default edge stroke, whose variable is scoped to the flow.
  const EDGE = "#b1b1b7";

  let open = $state(false);

  const groups = $derived(comparedGroups());
  const comparing = $derived(groups.length > 1);
  const attributes = $derived(figureAttributes(tree));
  const figure = $derived(nodeFigure(view, attributes));
  const stat = $derived(view.statistic === "median" ? "Median" : "Mean");
  const tint = shade("group-original", null);

  /** Made-up figures for the drawing, sized to fit it. */
  function samples(figure: NodeFigure): string[] {
    if (figure.kind === "cases") return ["2.7k", "18k"];
    if (figure.kind === "share") return ["17%", "17%"];
    if (figure.kind === "category") return ["62%", "57%"];
    return isDurationAttribute(figure.name) ? ["80d", "99d"] : ["84", "31"];
  }

  const drawn = $derived.by(() => {
    const visible = visibleNodes(tree, view, selectedVariants());
    return tree.nodes.filter((node) => visible.ids.has(node.id));
  });

  const edgeLabels = $derived(
    view.edgeLabels && attributes.some((attribute) => attribute.name === TRANSITION_TIME)
  );
  const significant = $derived(drawn.some(hasSignificant));
  const divergent = $derived(drawn.some(isDivergent));

  const focusName = $derived.by(() => {
    if (!comparing) return null;
    if (view.focus === "shared") return "both groups";
    return groups.find((group) => group.id === view.focus)?.name ?? null;
  });

  const scope = $derived(
    [
      focusName ? `Faded: steps not taken by ${focusName}` : "",
      view.significantOnly ? "Only variants with a finding" : ""
    ]
      .filter(Boolean)
      .join(" · ")
  );
</script>

{#snippet row(glyph: Snippet, title: Snippet, sub: string)}
  <div class="grid grid-cols-[4rem_1fr] items-center gap-3 px-3 py-1.75">
    <div class="flex h-8.5 items-center justify-center">{@render glyph()}</div>
    <div class="flex min-w-0 flex-col gap-px">
      <span class="text-xs leading-[1.45] font-semibold">{@render title()}</span>
      <span class="text-muted-foreground text-[0.625rem] leading-[1.35] text-pretty">{sub}</span>
    </div>
  </div>
{/snippet}

{#snippet nodeGlyph()}
  <span
    class="box-border flex h-8 w-15.5 items-center justify-center gap-1.25 rounded-[0.375rem] border text-[0.5625rem] font-semibold"
    style="background:{tint.fill};border-color:{tint.border}"
  >
    {#each groups as group, index (group.id)}
      <span style="color:var(--{group.color})">{samples(figure)[index]}</span>
    {/each}
  </span>
{/snippet}
{#snippet nodeTitle()}
  <FigureName {figure} statistic={view.statistic} />
{/snippet}

{#snippet edgeGlyph()}
  <span class="flex items-center gap-1.25">
    <span class="h-8 w-0.5" style="background:{EDGE}"></span>
    <span class="text-muted-foreground flex flex-col font-mono text-[0.5625rem] leading-tight">
      {#each groups as group, index (group.id)}
        <span class="flex items-center gap-0.75">
          {#if comparing}
            <span class="size-1.25 rounded-full" style="background:var(--{group.color})"></span>
          {/if}
          {view.statistic === "median" ? ["62d", "88d"][index] : ["80d", "99d"][index]}
        </span>
      {/each}
    </span>
  </span>
{/snippet}
{#snippet edgeTitle()}
  {stat} waiting time
{/snippet}

{#snippet widthGlyph()}
  <span class="flex h-7.5 items-stretch gap-1.75">
    <span class="w-px" style="background:{EDGE}"></span>
    <span class="w-0.75" style="background:{EDGE}"></span>
    <span class="w-1.5" style="background:{EDGE}"></span>
  </span>
{/snippet}
{#snippet widthTitle()}
  Line width = cases
{/snippet}

{#snippet badgeGlyph()}
  <span class="flex gap-1">
    {#each [{ count: 2, step: 2 }, { count: 1, step: 4 }] as badge (badge.step)}
      <span
        class="flex size-4.5 items-center justify-center rounded-full font-mono text-[0.625rem] font-semibold"
        style="background:var(--effect-{badge.step});color:var(--effect-{badge.step}-foreground)"
      >
        {badge.count}
      </span>
    {/each}
  </span>
{/snippet}
{#snippet badgeTitle()}
  Significant differences
{/snippet}

{#snippet divergentGlyph()}
  <span
    class="border-destructive ring-destructive/50 box-border flex h-8 w-15.5 items-center justify-center rounded-[0.375rem] border ring-2"
  >
    <Split class="text-destructive size-3.5" aria-hidden="true" />
  </span>
{/snippet}
{#snippet divergentTitle()}
  Attributes move apart
{/snippet}

{#snippet startGlyph()}
  <span class="flex flex-col items-center gap-0.5">
    <span class="size-3.5 rounded-full bg-emerald-500"></span>
    <span
      class="h-3.5 w-0.5"
      style="background:repeating-linear-gradient({EDGE} 0 0.25rem, transparent 0.25rem 0.4375rem)"
    ></span>
  </span>
{/snippet}
{#snippet startTitle()}
  Start
{/snippet}

<div class="absolute bottom-3.75 left-12.25 z-10">
  {#if open}
    <div
      class="bg-card border-border absolute bottom-9.5 left-0 flex max-h-[70vh] w-75 flex-col overflow-y-auto border shadow-md"
    >
      <div
        class="text-muted-foreground border-border border-b px-3 py-2 text-[0.625rem] font-semibold tracking-wide"
      >
        What the tree shows
      </div>
      <div class="flex flex-col py-1">
        {@render row(
          nodeGlyph,
          nodeTitle,
          comparing ? "One figure per group, in toolbar order" : "Under the activity name"
        )}
        {#if edgeLabels}
          {@render row(
            edgeGlyph,
            edgeTitle,
            comparing ? "From the previous step, per group" : "From the previous step"
          )}
        {/if}
        {#if view.edgeWidth === "cases"}
          {@render row(widthGlyph, widthTitle, "Thicker lines carry more cases")}
        {/if}
        {#if significant}
          {@render row(badgeGlyph, badgeTitle, "How many at this step. Darker = larger effect")}
        {/if}
        {#if divergent}
          {@render row(
            divergentGlyph,
            divergentTitle,
            "Two attributes shift in opposite directions here"
          )}
        {/if}
        {@render row(startGlyph, startTitle, "Every case begins here")}
      </div>
      {#if scope}
        <div class="text-muted-foreground border-border border-t px-3 py-2 text-[0.625rem]">
          {scope}
        </div>
      {/if}
    </div>
  {/if}

  <Button
    size="sm"
    title="What the tree shows"
    aria-expanded={open}
    class="h-7.5 gap-1.5 pr-2.5 pl-2 text-[0.6875rem] font-semibold shadow-sm hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)] aria-expanded:bg-[color-mix(in_oklab,var(--primary)_80%,black)]"
    onclick={() => (open = !open)}
  >
    <Info data-icon="inline-start" />
    Legend
    <ChevronUp
      data-icon="inline-end"
      class={cn("size-3 opacity-80 transition-transform", open && "rotate-180")}
    />
  </Button>
</div>
