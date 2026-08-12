<script lang="ts">
  /**
   * The Distributions view — every attribute of one node, side by side, ranked
   * by how much the two Groups differ on it.
   *
   * Its own route rather than a drawer under the tree: the tree and a wall of
   * histograms both want the whole window, and the two answer different
   * questions. The tree keeps its canvas; this keeps a step picker, which is the
   * same canvas at rail width, so the grid always says which branch it is about.
   *
   * Reachable only from a selected node. There is nothing to distribute without
   * one, and the tree is memory-only, so a cold arrival here — a reload, a typed
   * URL — goes back to the tree to build one.
   */
  import { goto } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Canvas from "$lib/components/projects/tree/canvas.svelte";
  import DistributionChart from "$lib/components/projects/tree/distribution-chart.svelte";
  import {
    gridAttributes,
    SCOPE_HINT,
    SCOPE_LABEL,
    SCOPES,
    type Scope,
    type Sort
  } from "$lib/distributions";
  import { formatNumber } from "$lib/format";
  import { currentProject } from "$lib/state/projects.svelte";
  import {
    addExtra,
    charts,
    clearDismissed,
    dismiss,
    forgetDistributions,
    loadDistributions,
    loaded,
    toggleExpanded
  } from "$lib/state/distributions.svelte";
  import { build, built, groupSlices, isStale, selected, settings, view } from "$lib/state/tree.svelte";
  import { attributeOptions, nodeDepth, pathTo, stepContext } from "$lib/tree";
  import { untrack } from "svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  const project = $derived(currentProject());
  const tree = $derived(built.tree);
  const node = $derived(
    tree && selected.id !== null ? (tree.nodes.find((n) => n.id === selected.id) ?? null) : null
  );

  // The view exists to describe a node. Without one there is nothing to draw and
  // no way to pick one here — the picker renders the built tree — so the tree,
  // where both are chosen, is the only sensible place to be.
  $effect(() => {
    if (project && (!built.tree || selected.id === null)) {
      goto(`/app/projects/${project.id}/tree`, { replaceState: true });
    }
  });

  /** The trace down to this step and everything that follows it — no siblings. */
  const context = $derived(tree && node ? stepContext(tree, node.id) : null);

  const depth = $derived(node && tree ? nodeDepth(tree, node.id) : 0);
  const path = $derived(node && tree ? pathTo(tree, node.id) : []);
  const compare = $derived(tree?.groupB !== null);
  const stale = $derived(isStale());

  const groups = $derived(groupSlices());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  /**
   * What is fetched: every card the node could show, dismissals included and in
   * a fixed order. Hiding a card and re-sorting the grid are both arrangements
   * of numbers already in hand, so neither costs a round trip.
   */
  const requested = $derived(node ? gridAttributes(node, charts.extra, [], "name") : []);
  /** What is drawn, in the order the user asked for. */
  const grid = $derived(node ? gridAttributes(node, charts.extra, charts.dismissed, charts.sort) : []);

  const byName = $derived(new Map(loaded.data?.attributes ?? []));

  /** Attributes the build never tested here — the only ones worth offering. */
  const available = $derived.by(() => {
    if (!project) return [];
    const open = new Set(requested.map((card) => card.name));
    return attributeOptions(project.columns, project.hiddenColumns).filter(
      (name) => !open.has(name)
    );
  });

  /** The Start root has no event of its own, so it has no "at this step". */
  const rootAtStep = $derived(depth === 0 && charts.scope === "atStep");

  /** Where the ranked cards end and the ones nothing was measured on begin. */
  const firstUntested = $derived(grid.findIndex((card) => card.test === null));

  // A dismissal hides a card at the node being read; the next node's tested
  // attributes are part of what it has to say, so the list does not follow.
  $effect(() => {
    void selected.id;
    untrack(clearDismissed);
  });

  // The numbers describe one node of one tree; both change here.
  $effect(() => {
    void [project?.id, built.key];
    untrack(forgetDistributions);
  });

  // Every input listed explicitly and the call untracked: `loadDistributions`
  // reads the same `loaded` fields it writes, so tracking its reads would make
  // the effect retrigger itself. `significantOnly` and the Variant selection are
  // in here because both prune leaves, which changes the case set.
  $effect(() => {
    const names = requested.map((card) => card.name);
    void [
      selected.id,
      charts.scope,
      built.key,
      view.significantOnly,
      settings.value.selectedVariants.length
    ];
    if (project) untrack(() => loadDistributions(project, names));
  });

  function setScope(next: string | undefined) {
    if (next) charts.scope = next as Scope;
  }

  function setSort(next: string | undefined) {
    if (next) charts.sort = next as Sort;
  }
</script>

{#if project && tree && node}
  <div class="flex min-h-0 flex-1">
    <!-- The step picker is the canvas itself, not a drawing of it: clicking a
         node here already selects it, and nothing can drift out of sync. It is
         narrowed to this step's own trace and what follows it — the cases the
         cards count are exactly the ones on those paths, so a sibling branch
         here would be an activity none of the numbers describe. -->
    <aside class="border-border bg-card flex w-68 shrink-0 flex-col border-r">
      <div class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" href="/app/projects/{project.id}/tree">
          <ArrowLeft data-icon="inline-start" />
          Tree
        </Button>
      </div>
      <div class="shrink-0 px-3 pt-2">
        <p class="text-muted-foreground text-[0.625rem] font-semibold uppercase">This step</p>
        <p class="text-muted-foreground text-[0.625rem]">
          Its trace and next steps. Click to move.
        </p>
      </div>
      <Canvas {tree} stale={false} deselectOnPaneClick={false} only={context} />
    </aside>

    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="border-border flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-semibold">{node.label}</span>
          <span class="text-muted-foreground truncate font-mono text-[0.625rem]">
            {path.map((step) => step.label).join(" → ")}
          </span>
        </div>
        {#if loaded.data && !stale}
          <p class="text-muted-foreground font-mono text-[0.6875rem]">
            {nameA}
            {formatNumber(loaded.data.casesA)}{#if compare} · {nameB} {formatNumber(loaded.data.casesB)}{/if}
            cases · {formatNumber(loaded.data.eventsA + loaded.data.eventsB)} events counted
          </p>
        {/if}

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <!-- The Scope decides which events every card counts, so it is stated
               here in words and repeated as a badge on each card. -->
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-[0.625rem] font-semibold uppercase">Showing</span>
            <ToggleGroup.Root
              type="single"
              size="sm"
              variant="outline"
              value={charts.scope}
              onValueChange={setScope}
            >
              {#each SCOPES as scope (scope)}
                <ToggleGroup.Item
                  value={scope}
                  disabled={scope === "atStep" && depth === 0}
                  aria-label={SCOPE_LABEL[scope]}
                  class="text-xs"
                >
                  {SCOPE_LABEL[scope]}
                </ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-[0.625rem] font-semibold uppercase">Sort</span>
            <ToggleGroup.Root
              type="single"
              size="sm"
              variant="outline"
              value={charts.sort}
              onValueChange={setSort}
            >
              <ToggleGroup.Item value="difference" class="text-xs">
                Biggest difference
              </ToggleGroup.Item>
              <ToggleGroup.Item value="name" class="text-xs">Name</ToggleGroup.Item>
            </ToggleGroup.Root>
          </div>

          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button variant="outline" size="sm" disabled={available.length === 0} {...props}>
                  <Plus data-icon="inline-start" />
                  Add attribute
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content
              class="flex max-h-72 w-64 flex-col gap-0.5 overflow-y-auto p-1"
              align="end"
            >
              <p class="text-muted-foreground px-2 py-1.5 text-[0.625rem]">
                Not tested by this build — adding one queries it now.
              </p>
              {#each available as attribute (attribute)}
                <Button
                  variant="ghost"
                  size="sm"
                  class="justify-start text-xs"
                  onclick={() => addExtra(attribute)}
                >
                  {attribute}
                </Button>
              {/each}
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>

      <p class="text-muted-foreground shrink-0 px-4 py-1.5 text-[0.6875rem]">
        Counting {SCOPE_HINT[charts.scope]}.
      </p>

      {#if stale}
        <!-- The node is named to the backend by the Variant keys of the tree on
             screen, so answering under edited chains would describe a case set
             matching neither the drawing nor the filters. -->
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <TriangleAlert class="text-destructive size-5" aria-hidden="true" />
          <p class="max-w-md text-xs">
            Filters, variants or settings changed since this tree was built. Distributions would
            describe a different set of cases than the tree on screen.
          </p>
          <Button size="sm" disabled={built.building} onclick={() => build(project)}>
            <RefreshCw data-icon="inline-start" class={built.building ? "animate-spin" : ""} />
            Rebuild tree
          </Button>
        </div>
      {:else if rootAtStep}
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p class="text-muted-foreground max-w-md text-xs">
            Start is where every case begins, not an activity — it has no event of its own to count.
          </p>
          <Button size="sm" variant="outline" onclick={() => (charts.scope = "wholeCase")}>
            Switch to whole case
          </Button>
        </div>
      {:else if loaded.error}
        <div class="flex flex-1 items-center justify-center p-4">
          <p class="text-destructive text-xs">{loaded.error}</p>
        </div>
      {:else if grid.length === 0}
        <div class="flex flex-1 items-center justify-center p-4">
          <p class="text-muted-foreground text-xs">
            No cards open — add an attribute to see this step's distributions.
          </p>
        </div>
      {:else}
        <!-- Three to a row whatever the window: the cards are read against each
             other, and a count that changes with the viewport moves a card to a
             different place on every resize. -->
        <div class="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto p-3">
          {#each grid as card, index (card.name)}
            {#if index === firstUntested}
              <!-- An unbadged card among ranked ones otherwise reads as "no
                   difference found" when it means "never looked". -->
              <div class="col-span-full flex items-baseline gap-2 pt-1">
                <span class="text-muted-foreground text-[0.625rem] font-semibold uppercase">
                  Untested
                </span>
                <span class="text-muted-foreground text-[0.625rem]">
                  No Significance Test ran on these at this step.
                </span>
              </div>
            {/if}
            {@const distribution = byName.get(card.name)}
            {#if distribution}
              <DistributionChart
                attribute={card.name}
                {distribution}
                test={card.test}
                {compare}
                {nameA}
                {nameB}
                scope={charts.scope}
                encoding={charts.encoding}
                onEncoding={(next) => (charts.encoding = next)}
                expanded={charts.expanded.includes(card.name)}
                onToggleExpanded={() => toggleExpanded(card.name)}
                onRemove={() => dismiss(card.name)}
              />
            {:else}
              <div class="bg-card border-border flex min-h-56 flex-col gap-2 border p-3">
                <Skeleton class="h-3 w-24" />
                <Skeleton class="min-h-0 w-full flex-1" />
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      {#if loaded.loading && loaded.data}
        <Badge variant="secondary" class="m-3 shrink-0 self-start">Updating…</Badge>
      {/if}
    </div>
  </div>
{/if}
