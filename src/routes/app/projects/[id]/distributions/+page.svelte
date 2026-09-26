<script lang="ts">
  /** Every attribute of one node, side by side, ranked by how much the Groups differ. */
  import { goto } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Canvas from "$lib/tree/components/canvas.svelte";
  import DistributionChart from "$lib/distributions/components/distribution-chart.svelte";
  import {
    PLOT_TOGGLE,
    SCOPES,
    SCOPE_HINT,
    SCOPE_LABEL,
    type Scope,
    type Sort
  } from "$lib/distributions/types";
  import { gridAttributes } from "$lib/distributions/utils/distributions";
  import { colorVar, formatNumber } from "$lib/format";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import {
    addExtra,
    charts,
    clearDismissed,
    dismiss,
    loadDistributions,
    loaded,
    resetDistributions,
    toggleExpanded
  } from "$lib/distributions/state/distributions.svelte";
  import { autoBuild, built, isStale, retryBuild } from "$lib/tree/state/build.svelte";
  import { selected, settings, view } from "$lib/tree/state/tree.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { attributeOptions } from "$lib/analysis/attributes";
  import { nodeDepth, stepContext } from "$lib/tree/utils/tree";
  import { untrack } from "svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Eye from "@lucide/svelte/icons/eye";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  const project = $derived(currentProject());
  const tree = $derived(built.tree);
  const node = $derived(
    tree && selected.id !== null ? (tree.nodes.find((n) => n.id === selected.id) ?? null) : null
  );

  $effect(() => {
    if (project && (!built.tree || selected.id === null)) {
      goto(`/app/projects/${project.id}/tree`, { replaceState: true });
    }
  });

  $effect(() => {
    if (project) autoBuild(project);
  });

  /** The trace down to this step and everything that follows it. */
  const context = $derived(tree && node ? stepContext(tree, node.id) : null);

  const depth = $derived(node && tree ? nodeDepth(tree, node.id) : 0);
  const compare = $derived((tree?.groups.length ?? 0) > 1);
  const stale = $derived(isStale());

  const groups = $derived(comparedGroups());

  /** The Groups as the charts need them: id to read the payload, name and colour to draw. */
  const chartGroups = $derived(
    groups.map((group) => ({ id: group.id, name: group.name, color: group.color }))
  );

  /**
   * What is fetched: every card the node could show, dismissals included and in
   * a fixed order, so hiding and re-sorting never cost a round trip.
   */
  const requested = $derived(node ? gridAttributes(node, charts.extra, [], "name") : []);
  /** What is drawn, in the order the user asked for. */
  const grid = $derived(
    node ? gridAttributes(node, charts.extra, charts.dismissed, charts.sort) : []
  );

  const byName = $derived(new Map(loaded.data?.attributes ?? []));

  /** Attributes the build never tested here. */
  const available = $derived.by(() => {
    if (!project) return [];
    const open = new Set(
      requested.filter((card) => !charts.dismissed.includes(card.name)).map((card) => card.name)
    );
    return attributeOptions(project.columns, project.hiddenColumns).filter(
      (name) => !open.has(name)
    );
  });

  /** The Start root has no event of its own, so it has no "at this step". */
  const rootAtStep = $derived(depth === 0 && charts.scope === "atStep");

  /** Where the ranked cards end and the ones nothing was measured on begin. */
  const firstUntested = $derived(grid.findIndex((card) => card.test === null));

  /** Each Group's case count in its own colour. */
  const groupCounts = $derived.by(() => {
    const data = loaded.data;
    if (!data) return [];
    return data.groups.map((totals) => {
      const group = chartGroups.find((candidate) => candidate.id === totals.id);
      return {
        name: group?.name ?? totals.id,
        cases: totals.cases,
        color: colorVar(group?.color ?? "group-original")
      };
    });
  });

  const SELECTED = `text-xs ${PLOT_TOGGLE}`;

  $effect(() => {
    void [project?.id, built.key];
    untrack(resetDistributions);
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
    <aside
      class="border-border bg-card flex w-68 shrink-0 flex-col border-r"
      data-tour="distribution-trace"
    >
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
      <Canvas {tree} deselectOnPaneClick={false} only={context} />
    </aside>

    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="border-border flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2"
      >
        <span class="min-w-0 truncate text-sm font-semibold">{node.label}</span>
        {#if loaded.data && !stale}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <!-- Colours come from the Group's own palette token as inline
                 styles: the user picks them, so no class name can be known
                 ahead of time for Tailwind to build. -->
            {#each groupCounts as { name, cases, color } (name)}
              <span
                class="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold"
                style="color:{color}"
              >
                <span class="size-2.5 shrink-0" style="background:{color}" aria-hidden="true"
                ></span>
                <span class="truncate">{name}</span>
                <span class="font-mono">{formatNumber(cases)}</span>
                <span class="text-muted-foreground font-normal">cases</span>
              </span>
            {/each}
            <span class="text-muted-foreground font-mono text-[0.6875rem]">
              {formatNumber(loaded.data.groups.reduce((sum, group) => sum + group.events, 0))} events
              counted
            </span>
          </div>
        {/if}

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-2" data-tour="distribution-scope">
            <span class="text-muted-foreground text-[0.625rem] font-semibold uppercase">
              Count events from
            </span>
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
                  class={SELECTED}
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
              <ToggleGroup.Item value="difference" class={SELECTED}>
                Biggest difference
              </ToggleGroup.Item>
              <ToggleGroup.Item value="name" class={SELECTED}>Name</ToggleGroup.Item>
            </ToggleGroup.Root>
          </div>

          {#if charts.dismissed.length > 0}
            <Button variant="outline" size="sm" onclick={clearDismissed}>
              <Eye data-icon="inline-start" />
              Show all ({charts.dismissed.length})
            </Button>
          {/if}

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
                Not tested by this build. Adding one queries it now.
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

      <p class="border-border bg-secondary/50 shrink-0 border-b px-4 py-2 text-sm">
        <span class="text-primary font-semibold">{SCOPE_LABEL[charts.scope]}:</span>
        <span class="text-muted-foreground">
          {SCOPE_HINT[charts.scope]}.
          {#if loaded.data && !stale}
            Same {formatNumber(loaded.data.groups.reduce((sum, group) => sum + group.cases, 0))} cases
            either way.
          {/if}
        </span>
      </p>

      {#if stale}
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          {#if built.error && !built.building}
            <TriangleAlert class="text-destructive size-5" aria-hidden="true" />
            <p class="text-destructive max-w-md text-xs">{built.error}</p>
            <Button size="sm" onclick={() => retryBuild(project)}>
              <RotateCcw data-icon="inline-start" />
              Try again
            </Button>
          {:else}
            <p class="text-muted-foreground max-w-md text-xs">
              Rebuilding the tree. Distributions would describe a different set of cases than the
              tree on screen.
            </p>
          {/if}
        </div>
      {:else if rootAtStep}
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p class="text-muted-foreground max-w-md text-xs">
            Start is where every case begins, not an activity, so it has no event of its own to
            count.
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
            No cards open. Add an attribute to see this step's distributions.
          </p>
        </div>
      {:else}
        <div
          class="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto p-3"
          data-tour="distribution-grid"
        >
          {#each grid as card, index (card.name)}
            {#if index === firstUntested}
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
                groups={chartGroups}
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
