<script lang="ts">
  import { formatNumber } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import { formatSigned, isGap, share } from "$lib/analysis/utils/change";
  import ColumnHead from "$lib/statistics/components/column-head.svelte";
  import GroupName from "$lib/statistics/components/group-name.svelte";
  import VariantPath from "$lib/components/variant-path/variant-path.svelte";
  import { Button } from "$lib/components/ui/button/index.js";

  let { groups, comparison }: { groups: Group[]; comparison: ResponseGroupComparison } = $props();

  /** Rows added per step of "Show more". */
  const PAGE = 50;

  let filter = $state<string>("all");
  let shown = $derived.by(() => {
    void filter;
    return PAGE;
  });

  const pair = $derived(groups.length === 2);
  const census = $derived(comparison.variantCensus);
  const cases = $derived(
    Object.fromEntries(comparison.groups.map((figure) => [figure.id, figure.cases]))
  );
  const options = $derived([
    { value: "all", label: "All", count: census.total, group: null as Group | null },
    ...(pair
      ? [
          { value: "both", label: "In both", count: census.shared, group: null },
          ...groups.map((group) => ({
            value: group.id,
            label: "Only in",
            count: census.only[group.id] ?? 0,
            group
          }))
        ]
      : [])
  ]);
  const matching = $derived(
    comparison.variants.filter((row) => {
      const present = groups.filter((group) => (row.cases[group.id] ?? 0) > 0);
      if (filter === "all") return true;
      if (filter === "both") return present.length === groups.length;
      return present.length === 1 && present[0].id === filter;
    })
  );
  const rows = $derived(
    matching.slice(0, shown).map((row, index) => {
      const values = groups.map((group) => share(row.cases[group.id] ?? 0, cases[group.id] ?? 0));
      const present = groups.map((group) => (row.cases[group.id] ?? 0) > 0);
      return {
        rank: index + 1,
        key: row.activities.join("\u0001"),
        activities: row.activities,
        values,
        present,
        delta: pair ? values[1] - values[0] : null
      };
    })
  );
  const emptyGroup = $derived(groups.find((group) => group.id === filter) ?? null);
</script>

<div class="bg-card flex flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b px-4.5 py-2.5">
    {#each options as option (option.value)}
      <button
        type="button"
        aria-pressed={filter === option.value}
        class="inline-flex h-6.5 cursor-pointer items-center gap-1.5 border px-2.5 text-[0.6875rem] {filter ===
        option.value
          ? 'bg-muted border-foreground/30 text-foreground font-semibold'
          : 'bg-card text-muted-foreground hover:text-foreground font-medium'}"
        onclick={() => (filter = option.value)}
      >
        {option.label}
        {#if option.group}<GroupName group={option.group} />{/if}
        <span class="text-muted-foreground font-mono">{formatNumber(option.count)}</span>
      </button>
    {/each}
  </div>
  <ColumnHead>
    <span class="w-6 shrink-0">#</span>
    <span class="min-w-0 flex-1">Path</span>
    {#each groups as group (group.id)}
      <span class="flex w-20 shrink-0 justify-end"><GroupName {group} /></span>
    {/each}
    {#if pair}
      <span class="w-16 shrink-0 text-right">Δ pp</span>
    {/if}
  </ColumnHead>
  {#each rows as row (row.key)}
    {@const only = pair && row.present.filter(Boolean).length === 1}
    {@const gap = isGap(row.delta)}
    <div class="flex items-center gap-3 border-t px-4.5 py-1 {gap ? 'bg-destructive/5' : ''}">
      <span class="text-muted-foreground w-6 shrink-0 font-mono text-[0.6875rem]">{row.rank}</span>
      <VariantPath activities={row.activities} class="flex-1" />
      {#each groups as group, index (group.id)}
        <span
          class="w-20 shrink-0 text-right font-mono text-xs {index === 0 && pair
            ? 'text-muted-foreground'
            : 'font-semibold'}"
        >
          {row.present[index] ? `${row.values[index].toFixed(1)}%` : "—"}
        </span>
      {/each}
      {#if pair}
        <span
          class="w-16 shrink-0 text-right font-mono text-xs {gap || only
            ? 'text-destructive'
            : 'text-muted-foreground'}"
        >
          {#if only}
            <span title="Only in {groups[row.present[0] ? 0 : 1].name}">only</span>
          {:else}
            {formatSigned(row.delta)}
          {/if}
        </span>
      {/if}
    </div>
  {:else}
    <div class="flex flex-col gap-1 border-t px-4.5 py-7">
      <span class="text-[0.8125rem] font-semibold">
        No variants {#if emptyGroup}only in <GroupName group={emptyGroup} />{:else}here{/if}
      </span>
      {#if emptyGroup}
        <span class="text-muted-foreground max-w-[60ch] text-xs text-pretty">
          Every path <GroupName group={emptyGroup} /> follows also appears in the other group.
        </span>
      {/if}
    </div>
  {/each}
  <div
    class="text-muted-foreground flex items-center gap-2 border-t px-4.5 py-2.5 text-[0.6875rem]"
  >
    Showing {formatNumber(rows.length)} of {formatNumber(matching.length)} variants, most cases first
    {#if rows.length < matching.length}
      <span class="ml-auto flex gap-1.5">
        <Button variant="outline" size="xs" onclick={() => (shown += PAGE)}>
          Show {formatNumber(Math.min(PAGE, matching.length - rows.length))} more
        </Button>
        <Button variant="ghost" size="xs" onclick={() => (shown = matching.length)}>
          Show all
        </Button>
      </span>
    {/if}
  </div>
</div>
