<script lang="ts">
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import type { Summary } from "$lib/analysis/types";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { selected } from "$lib/dfg/state/view.svelte";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import type { FaceGroup } from "$lib/dfg/types";
  import { formatDuration, formatNumber } from "$lib/format";

  let {
    graph,
    simplified,
    groups
  }: { graph: ResponseDfg; simplified: Simplified; groups: FaceGroup[] } = $props();

  const node = $derived(simplified.nodes.find((candidate) => candidate.id === selected.id) ?? null);
  const measured = $derived(graph.nodes.find((candidate) => candidate.id === selected.id) ?? null);

  const blocks = $derived(
    measured
      ? Object.entries(measured.attributes).sort(
          ([, a], [, b]) =>
            Number(b.test?.significant ?? false) - Number(a.test?.significant ?? false)
        )
      : []
  );

  const edgesInto = $derived(
    node ? simplified.edges.filter((edge) => edge.target === node.id) : []
  );
  const edgesOutOf = $derived(
    node ? simplified.edges.filter((edge) => edge.source === node.id) : []
  );

  function centre(summary: Summary | undefined, attribute: string): string {
    if (!summary) return "—";
    if (summary.type === "categorical") {
      const top = Object.entries(summary.counts).sort(([, a], [, b]) => b - a)[0];
      return top ? `${top[0]} (${formatNumber(top[1])})` : "—";
    }
    return isDurationAttribute(attribute)
      ? formatDuration(summary.median)
      : formatNumber(Math.round(summary.median));
  }
</script>

{#if node}
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
    <div class="space-y-1">
      <h2 class="text-sm font-semibold">{node.label}</h2>
      <p class="text-muted-foreground text-xs">
        {node.kind === "activity" ? "Activity" : node.kind === "start" ? "Start" : "End"} · {edgesInto.length}
        in, {edgesOutOf.length} out
      </p>
    </div>

    <div class="space-y-1">
      {#each groups as group (group.id)}
        {@const counts = node.counts[group.id]}
        <div class="flex items-baseline justify-between text-xs">
          <span style="color:var(--{group.color})">{group.name}</span>
          <span class="text-muted-foreground font-mono">
            {counts
              ? `${formatNumber(counts.cases)} cases · ${formatNumber(counts.events)} events`
              : "—"}
          </span>
        </div>
      {/each}
    </div>

    {#if blocks.length > 0}
      <Separator />
      <div class="space-y-3">
        <p class="text-xs font-medium">Attributes, median per group</p>
        {#each blocks as [name, block] (name)}
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium"><AttributeName {name} /></span>
              {#if block.test?.significant}
                <Badge variant="destructive" class="text-[0.625rem]">
                  {block.test.higher
                    ? `higher in ${groups.find((g) => g.id === block.test?.higher)?.name ?? block.test.higher}`
                    : "differs"}
                </Badge>
              {:else if block.test}
                <span class="text-muted-foreground text-[0.625rem]">no finding</span>
              {/if}
            </div>
            {#each groups as group (group.id)}
              <div class="flex items-baseline justify-between text-[0.6875rem]">
                <span class="text-muted-foreground">{group.name}</span>
                <span class="font-mono">{centre(block.summaries[group.id], name)}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {:else if node.kind === "activity"}
      <p class="text-muted-foreground text-xs">
        No attributes were asked for. Pick some under Graph to test them here.
      </p>
    {/if}
  </div>
{:else}
  <div class="text-muted-foreground p-4 text-xs">Pick an activity to see what it measures.</div>
{/if}
