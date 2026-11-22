<script lang="ts">
  /**
   * Each Group's share of its cases in the category a two-by-two counts, one
   * bar per Group on one scale from 0 to 100%, with the cases behind it.
   */
  import { sharePercent } from "$lib/dfg/utils/findings";
  import { colorVar, formatNumber } from "$lib/format";

  let {
    shares,
    groups
  }: {
    shares: Record<string, { share: number; hits: number; n: number }>;
    groups: { id: string; name: string; color: string }[];
  } = $props();
</script>

<div
  class="grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-[0.625rem]"
>
  {#each groups as group (group.id)}
    {@const one = shares[group.id]}
    <span class="truncate font-medium" style="color:{colorVar(group.color)}" title={group.name}>
      {group.name}
    </span>
    <span class="bg-muted h-2">
      <span class="block h-full" style="width:{one.share * 100}%;background:{colorVar(group.color)}"
      ></span>
    </span>
    <span class="tabular-nums">
      <span class="font-semibold">{sharePercent(one.share)}</span>
      <span class="text-muted-foreground">· {formatNumber(one.hits)} of {formatNumber(one.n)}</span>
    </span>
  {/each}
</div>
