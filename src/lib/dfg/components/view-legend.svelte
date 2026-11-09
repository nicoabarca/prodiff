<script lang="ts">
  /**
   * What the marks on the graph mean, one drawing and one sentence per mark,
   * behind a button beside the zoom controls. It follows the Display settings:
   * a row appears only while its mark is drawn. It stays open until toggled, so
   * those settings can be changed with it in view.
   */
  import type { Snippet } from "svelte";
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { splitting, view } from "$lib/dfg/state/view.svelte";
  import type { FaceGroup } from "$lib/dfg/types";
  import { builtAttributes, shownEdgeLabel } from "$lib/dfg/utils/display";
  import { EFFECT_STROKE } from "$lib/dfg/utils/face";
  import { figureAttributes, nodeFigure, type NodeFigure } from "$lib/dfg/utils/figure";
  import { nodeDifferences, type Finding } from "$lib/dfg/utils/findings";
  import { shade } from "$lib/groups/utils/shade";
  import FigureName from "$lib/tree/components/figure-name.svelte";
  import { cn } from "$lib/utils";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Info from "@lucide/svelte/icons/info";

  let {
    graph,
    findings,
    groups
  }: { graph: ResponseDfg; findings: Finding[]; groups: FaceGroup[] } = $props();

  const EDGE = "var(--muted-foreground)";

  let open = $state(false);

  const comparing = $derived(groups.length > 1);
  const split = $derived(splitting(groups.length));
  const built = $derived(builtAttributes(graph));
  const figure = $derived(nodeFigure(view, figureAttributes(graph)));
  const edgeLabel = $derived(shownEdgeLabel(view.edgeLabel, built));
  const stat = $derived(view.statistic === "median" ? "Median" : "Mean");
  const tint = shade("group-original", null);
  const shades = [0, 0.5, 1].map((step) => shade("group-original", step));

  /** Made-up figures for the drawing, sized to fit it. */
  function samples(figure: NodeFigure): string[] {
    if (figure.kind === "cases") return ["2.7k", "18k"];
    if (figure.kind === "events") return ["4.1k", "25k"];
    if (figure.kind === "share") return ["17%", "21%"];
    if (figure.kind === "category") return ["62%", "57%"];
    return isDurationAttribute(figure.name) ? ["2h", "3h"] : ["84", "31"];
  }

  const edgeSamples = $derived(
    edgeLabel === "waiting"
      ? ["4h", "1d"]
      : edgeLabel === "share"
        ? ["62%", "48%"]
        : ["930", "1.2k"]
  );

  const edgeTitle = $derived(
    edgeLabel === "waiting"
      ? `${stat} waiting time`
      : edgeLabel === "share"
        ? "% followed"
        : "Cases that follow"
  );
  const edgeSub = $derived(
    edgeLabel === "waiting"
      ? "From the previous activity"
      : edgeLabel === "share"
        ? "Of the cases reaching the previous activity"
        : "Cases that take this step"
  );

  /** What a red edge differs in, or `null` when no edge is coloured by a test. */
  const redFor = $derived.by(() => {
    if (!comparing) return null;
    if (edgeLabel === "waiting") return "Differs in waiting time";
    if (edgeLabel === "frequency" || edgeLabel === "share") {
      return built.edgeFrequency ? "Differs in how often it is followed" : null;
    }
    return "Differs in at least one test";
  });

  const significant = $derived(nodeDifferences(findings).size > 0);

  const scope = $derived(
    [
      comparing && !split && view.emphasis !== "all"
        ? `Faded: what ${
            view.emphasis === "shared"
              ? "both groups do not reach"
              : `${groups.find((group) => group.id === view.emphasis)?.name ?? "the group"} does not reach`
          }`
        : "",
      view.findingsOnly ? "Faded: what has no finding" : ""
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
  {#if figure.kind === "events"}
    Events at this activity
  {:else}
    <FigureName {figure} statistic={view.statistic} />
  {/if}
{/snippet}

{#snippet shadeGlyph()}
  <span class="flex gap-1">
    {#each shades as step, index (index)}
      <span
        class="box-border size-4.5 rounded-[0.25rem] border"
        style="background:{step.fill};border-color:{step.border}"
      ></span>
    {/each}
  </span>
{/snippet}
{#snippet shadeTitle()}
  Darker = more {view.measure}
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
          {edgeSamples[index]}
        </span>
      {/each}
    </span>
  </span>
{/snippet}
{#snippet edgeLabelTitle()}
  {edgeTitle}
{/snippet}

{#snippet widthGlyph()}
  <span class="flex h-7.5 items-stretch gap-1.75">
    <span class="w-px" style="background:{EDGE}"></span>
    <span class="w-0.75" style="background:{EDGE}"></span>
    <span class="w-1.5" style="background:{EDGE}"></span>
  </span>
{/snippet}
{#snippet widthTitle()}
  Line width = {view.measure}
{/snippet}

{#snippet redGlyph()}
  <span class="flex h-7.5 items-stretch gap-1.75">
    <span class="w-0.75" style="background:{EDGE}"></span>
    {#each Object.values(EFFECT_STROKE) as stroke (stroke)}
      <span class="w-0.75" style="background:{stroke}"></span>
    {/each}
  </span>
{/snippet}
{#snippet redTitle()}
  {redFor}
{/snippet}

{#snippet ownGlyph()}
  <span class="flex h-7.5 items-stretch gap-1.75">
    {#each groups as group (group.id)}
      <span class="w-0.75" style="background:var(--{group.color})"></span>
    {/each}
  </span>
{/snippet}
{#snippet ownTitle()}
  One group only
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

{#snippet startGlyph()}
  <span class="flex flex-col items-center gap-0.5">
    <span class="size-3.5 rounded-full bg-emerald-500"></span>
    <span
      class="h-3.5 w-0.5 opacity-60"
      style="background:repeating-linear-gradient({EDGE} 0 0.25rem, transparent 0.25rem 0.5rem)"
    ></span>
  </span>
{/snippet}
{#snippet startTitle()}
  Start and end
{/snippet}

<div class="absolute bottom-3.75 left-12.25 z-10">
  {#if open}
    <div
      class="bg-card border-border absolute bottom-9.5 left-0 flex max-h-[70vh] w-75 flex-col overflow-y-auto border shadow-md"
    >
      <div
        class="text-muted-foreground border-border border-b px-3 py-2 text-[0.625rem] font-semibold tracking-wide"
      >
        What the graph shows
      </div>
      <div class="flex flex-col py-1">
        {@render row(
          nodeGlyph,
          nodeTitle,
          comparing ? "One figure per group, in toolbar order" : "Under the activity name"
        )}
        {@render row(shadeGlyph, shadeTitle, "Shaded against every activity drawn")}
        {#if edgeLabel !== "off"}
          {@render row(edgeGlyph, edgeLabelTitle, comparing ? `${edgeSub}, per group` : edgeSub)}
        {/if}
        {#if view.edgeWidth === "scaled"}
          {@render row(widthGlyph, widthTitle, `Thicker lines carry more ${view.measure}`)}
        {/if}
        {#if redFor}
          {@render row(
            redGlyph,
            redTitle,
            "Grey: no significant difference. Paler red for a negligible effect, darker for a large one"
          )}
        {/if}
        {#if comparing && !split}
          {@render row(ownGlyph, ownTitle, "An edge in a group's colour is followed by it alone")}
        {/if}
        {#if significant}
          {@render row(badgeGlyph, badgeTitle, "How many at this activity. Darker = larger effect")}
        {/if}
        {@render row(startGlyph, startTitle, "Every case begins and ends on a dashed edge")}
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
    title="What the graph shows"
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
