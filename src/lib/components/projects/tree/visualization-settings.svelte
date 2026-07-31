<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Everything here reads the tree
   * already in memory — nothing triggers a rebuild, so these controls stay
   * usable even while the tree on screen is stale.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { groupSlices, selectedVariants, view } from "$lib/state/tree.svelte";
  import {
    visibleNodes,
    TRANSITION_TIME,
    type DirectedTree,
    type Direction,
    type GroupFocus,
    type Secondary
  } from "$lib/tree";
  import { formatNumber } from "$lib/format";
  import Eye from "@lucide/svelte/icons/eye";

  let { tree }: { tree: DirectedTree } = $props();

  // Every node carries a block per attribute built, empty ones included, so the
  // root is enough to know what the tree can show.
  const attributes = $derived([
    ...Object.keys(tree.nodes[0]?.eventLevel ?? {}),
    ...(tree.nodes[0]?.transitionTime ? [TRANSITION_TIME] : [])
  ]);

  // The slices the Groups come from, so every control names them the way the
  // user does. They fall back to "Group A"/"Group B" only if a slice is gone.
  const groups = $derived(groupSlices());
  const nameA = $derived(groups[0]?.name ?? "Group A");
  const nameB = $derived(groups[1]?.name ?? "Group B");

  const secondaryOptions = $derived([
    { value: "cases", label: `Cases (${nameA} · ${nameB})` },
    { value: "casesA", label: `Cases — ${nameA}` },
    { value: "casesB", label: `Cases — ${nameB}` },
    ...attributes.map((name) => ({ value: name, label: `Mean ${name}` }))
  ]);

  const focusLabels = $derived<Record<GroupFocus, string>>({
    all: "All nodes",
    a: `${nameA} only`,
    b: `${nameB} only`,
    shared: "Shared"
  });

  const hasTransitionTime = $derived(attributes.includes(TRANSITION_TIME));
  const visible = $derived(visibleNodes(tree, view, selectedVariants()));
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm">
        <Eye data-icon="inline-start" />
        Visualization settings
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80">
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <Label class="text-xs">Layout direction</Label>
        <ToggleGroup.Root
          type="single"
          size="sm"
          value={view.direction}
          onValueChange={(value) => {
            if (value) view.direction = value as Direction;
          }}
        >
          <ToggleGroup.Item value="TB" aria-label="Top to bottom">TB</ToggleGroup.Item>
          <ToggleGroup.Item value="LR" aria-label="Left to right">LR</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label class="text-xs">Node shows</Label>
        <Select.Root
          type="single"
          value={view.secondary}
          onValueChange={(value) => (view.secondary = value as Secondary)}
        >
          <Select.Trigger class="h-8 text-xs">
            {secondaryOptions.find((o) => o.value === view.secondary)?.label ?? "Cases (A · B)"}
          </Select.Trigger>
          <Select.Content>
            {#each secondaryOptions as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label class="text-xs">Highlight group</Label>
        <Select.Root
          type="single"
          value={view.focus}
          onValueChange={(value) => (view.focus = value as GroupFocus)}
        >
          <Select.Trigger class="h-8 text-xs">{focusLabels[view.focus]}</Select.Trigger>
          <Select.Content>
            {#each Object.entries(focusLabels) as [value, label] (value)}
              <Select.Item {value}>{label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground text-[0.625rem]">
          Dims the rest — the tree keeps its shape.
        </p>
      </div>

      <label class="flex items-start gap-2 text-xs">
        <Checkbox
          checked={view.edgeLabels}
          disabled={!hasTransitionTime}
          onCheckedChange={(checked) => (view.edgeLabels = checked === true)}
        />
        <span>
          Transition time on edges
          <span class="text-muted-foreground block text-[0.625rem]">
            {hasTransitionTime
              ? "Mean wait between the two activities, per group."
              : "Build with Transition Time selected to show this."}
          </span>
        </span>
      </label>

      <label class="flex items-start gap-2 text-xs">
        <Checkbox
          checked={view.significantOnly}
          onCheckedChange={(checked) => (view.significantOnly = checked === true)}
        />
        <span>
          Only variants with a significant finding
          <span class="text-muted-foreground block text-[0.625rem]">
            Whole paths are kept or dropped, never truncated.
          </span>
        </span>
      </label>

      <div class="text-muted-foreground border-border border-t pt-2 text-[0.625rem]">
        {formatNumber(visible.variantsShown)} variants shown
        {#if visible.variantsHidden > 0}
          · {formatNumber(visible.variantsHidden)} hidden by these two filters, which draw
          less of the built tree without rebuilding it — the aggregates and tests still
          describe every variant the last build included.
        {/if}
        {#if view.collapsed.size > 0}
          <Button
            variant="ghost"
            size="sm"
            class="mt-1 h-6 w-full text-[0.625rem]"
            onclick={() => (view.collapsed = new Set())}
          >
            Expand all ({view.collapsed.size} collapsed)
          </Button>
        {/if}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
