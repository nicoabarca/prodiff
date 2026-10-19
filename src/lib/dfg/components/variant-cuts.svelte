<script lang="ts">
  /**
   * The Behaviour and Paths sliders, staging the Variants the next build is
   * made of. Moving either restages from the two, dropping any row picked by
   * hand; only Apply rebuilds, so the tests always describe what is drawn.
   */
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { cuts } from "$lib/dfg/state/variants.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import { cutVariants, shapeOf } from "$lib/dfg/utils/cut";
  import { formatNumber } from "$lib/format";
  import type { Group } from "$lib/groups/types";
  import type { ResponseVariantRow } from "$lib/tree/invokers/types";
  import { casesShare, coverageFloor } from "$lib/tree/utils/variants";
  import Info from "@lucide/svelte/icons/info";

  let {
    groups,
    rows,
    staged,
    onStage
  }: {
    groups: Group[];
    rows: ResponseVariantRow[];
    staged: Set<string>;
    onStage: (keys: Iterable<string>) => void;
  } = $props();

  /** The coverage the staged Variants hold, in percent. Variants enter whole,
      so it lands above where the Behaviour slider was set. */
  const share = $derived(Math.round(casesShare(rows, staged) * 100));

  const floor = $derived(Math.max(1, Math.round(coverageFloor(rows) * 100)));

  const behaviour = $derived(cuts.coverage ?? Math.max(share, floor));

  const shape = $derived(shapeOf(rows.filter((row) => staged.has(row.key))));

  function restage() {
    if (rows.length === 0) return;
    const coverage = Math.min(100, Math.max(floor, behaviour)) / 100;
    onStage(
      cutVariants(
        rows,
        coverage,
        cuts.paths,
        groups.map((group) => group.id),
        view.measure
      )
    );
  }

  function setBehaviour(next: number) {
    cuts.coverage = next;
    restage();
  }

  function setPaths(next: number) {
    cuts.paths = next / 100;
    restage();
  }

  const HINT = "text-muted-foreground hover:text-foreground shrink-0 cursor-help";
  const CAPTION = "text-muted-foreground w-16 shrink-0 text-[0.625rem] tracking-wide uppercase";
  const VALUE = "text-muted-foreground w-8 text-right font-mono text-[0.6875rem] tabular-nums";
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-center gap-2">
    <span class={CAPTION}>Behaviour</span>
    <Slider
      type="single"
      class="flex-1"
      aria-label="Behaviour covered"
      value={behaviour}
      onValueChange={setBehaviour}
      min={1}
      max={100}
      step={1}
      disabled={rows.length === 0}
    />
    <span class={VALUE}>{share}%</span>
    <Tooltip.Root>
      <Tooltip.Trigger class={HINT} aria-label="What the Behaviour slider stages">
        <Info class="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-72">
        The most common variants, up to this share of cases.
      </Tooltip.Content>
    </Tooltip.Root>
  </div>

  <div class="flex items-center gap-2">
    <span class={CAPTION}>Paths</span>
    <Slider
      type="single"
      class="flex-1"
      aria-label="Paths kept"
      value={Math.round(cuts.paths * 100)}
      onValueChange={setPaths}
      min={0}
      max={100}
      step={1}
      disabled={rows.length === 0}
    />
    <span class={VALUE}>{Math.round(cuts.paths * 100)}%</span>
    <Tooltip.Root>
      <Tooltip.Trigger class={HINT} aria-label="What the Paths slider stages">
        <Info class="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-72">
        Of those, only the variants whose every transition is among this share of the busiest. A
        variant that runs a rarer transition leaves the graph and its tests.
      </Tooltip.Content>
    </Tooltip.Root>
  </div>

  <p class="text-muted-foreground text-[0.6875rem] tabular-nums">
    Staged: {formatNumber(staged.size)}
    {staged.size === 1 ? "variant" : "variants"} · {share}% of cases · {formatNumber(
      shape.activities
    )} activities · {formatNumber(shape.paths)} paths
  </p>
</div>
