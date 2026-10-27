<script lang="ts">
  /**
   * One activity's or edge's Significance Test on one attribute, collapsed to
   * the place, its verdict and its magnitude, and opening on both Groups'
   * figures. Clicking anywhere on the card but its chevron frames and lights
   * the place on the canvas; a click that ends a text selection does not.
   * Each time `reveal` moves on past 0 the card opens and scrolls into view;
   * each time `collapse` moves on after the card mounts, it closes.
   */
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { effectBand } from "$lib/tree/utils/effect";
  import { higherGroup, testLine, untestable, verdict } from "$lib/tree/utils/verdict";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { isDurationAttribute, TRANSITION_TIME } from "$lib/analysis/attributes";
  import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
  import { isPointed, point } from "$lib/dfg/state/view.svelte";
  import { frequencyVerdict, type Finding } from "$lib/dfg/utils/findings";
  import { colorVar } from "$lib/format";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { cn } from "$lib/utils";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Square from "@lucide/svelte/icons/square";
  import { tick, untrack } from "svelte";

  let {
    finding,
    named = "place",
    reveal = 0,
    collapse = 0
  }: {
    finding: Finding;
    named?: "place" | "attribute";
    reveal?: number;
    collapse?: number;
  } = $props();

  let open = $state(false);
  let card = $state<HTMLElement | null>(null);

  $effect(() => {
    if (reveal === 0) return;
    open = true;
    void tick().then(() =>
      requestAnimationFrame(() => card?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    );
  });

  // A card mounted after the last Collapse all keeps what `reveal` opened.
  let collapsedAt = untrack(() => collapse);
  $effect(() => {
    if (collapse === collapsedAt) return;
    collapsedAt = collapse;
    open = false;
  });

  const groups = $derived(comparedGroups());
  const block = $derived(finding.block);
  const duration = $derived(isDurationAttribute(finding.attribute));
  const higher = $derived(higherGroup(block.test, groups));
  const differs = $derived(block.test?.significant ?? false);

  /** What the attribute measures at this place, for the ones whose name does not say. */
  const caption = $derived.by(() => {
    const label = finding.place.label;
    switch (finding.attribute) {
      case TRANSITION_TIME:
        return `Time waited on the edge ${label}.`;
      case ACTIVITY_FREQUENCY:
        return `Share of each group's cases that reach ${label}.`;
      case EDGE_FREQUENCY:
        return `Share of each group's cases that follow ${label}.`;
      case REPETITIONS:
        return `Times each case that reaches ${label} runs it.`;
      default:
        return null;
    }
  });

  const selecting = () => (window.getSelection()?.toString() ?? "") !== "";
</script>

<Collapsible.Root
  bind:open
  bind:ref={card}
  class={cn(
    "border-border border-t",
    open && "bg-sidebar",
    isPointed(finding.place) && "shadow-[inset_0.1875rem_0_0_var(--primary)]"
  )}
>
  <div
    role="button"
    tabindex="0"
    aria-label="Show {finding.place.label} on the graph"
    class="hover:bg-muted focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset"
    onclick={() => {
      if (!selecting()) point(finding.place);
    }}
    onkeydown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      point(finding.place);
    }}
  >
    <div
      class="grid w-full grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2 pr-4 pl-6 text-left"
    >
      <Collapsible.Trigger
        class="text-muted-foreground hover:text-foreground -m-1 flex cursor-pointer p-1"
        aria-label={open ? "Hide the figures" : "Show the figures"}
        onclick={(event) => event.stopPropagation()}
        onkeydown={(event) => event.stopPropagation()}
      >
        <ChevronRight
          class={cn("size-3.5 transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span
          class={cn(
            "flex items-center gap-1.25 text-xs font-semibold whitespace-nowrap",
            !differs && "text-muted-foreground"
          )}
        >
          {#if named === "attribute"}
            <span class="truncate"><AttributeName name={finding.attribute} /></span>
          {:else}
            {#if finding.place.kind === "edge"}
              <ArrowRight class="size-3 shrink-0" aria-hidden="true" />
            {:else}
              <Square class="size-2.5 shrink-0" aria-hidden="true" />
            {/if}
            <span class="truncate" title={finding.place.label}>{finding.place.label}</span>
          {/if}
        </span>
        <span
          class="text-muted-foreground flex items-center gap-1.25 text-[0.625rem] whitespace-nowrap"
        >
          {#if higher}
            <span
              class="size-1.5 shrink-0 rounded-full"
              style="background:{colorVar(higher.color)}"
              aria-hidden="true"
            ></span>
          {/if}
          <span class="truncate"
            >{frequencyVerdict(finding.attribute, block, groups) ??
              verdict(block, groups, duration)}</span
          >
        </span>
      </span>
      {#if block.test}
        <EffectChip test={block.test} tooltip={false} />
      {:else}
        <span></span>
      {/if}
    </div>
    <Collapsible.Content class="flex flex-col gap-2 pr-4 pb-3.5 pl-11.5">
      {#if caption}
        <p class="text-muted-foreground text-[0.625rem]">{caption}</p>
      {/if}
      <SummaryCompare summaries={block.summaries} {duration} />
      {#if !block.test}
        <p class="text-muted-foreground text-[0.625rem]">{untestable(block, groups)}</p>
      {:else}
        {#if block.test.significant && effectBand(block.test.effectSize) === "negligible"}
          <p class="text-muted-foreground text-[0.625rem]">
            The test is confident this gap is real, but it is too small to act on.
          </p>
        {/if}
        {#if block.test.approximate}
          <p class="text-muted-foreground text-[0.625rem]">
            Approximate: some values are too rare here for chi-square to be exact.
          </p>
        {/if}
        <p class="text-muted-foreground font-mono text-[0.625rem] text-pretty">
          {testLine(block.test, groups)}
        </p>
      {/if}
    </Collapsible.Content>
  </div>
</Collapsible.Root>
