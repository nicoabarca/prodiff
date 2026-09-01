<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Nothing here triggers a
   * rebuild, so these controls stay usable while the tree is stale.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { comparedGroups, selectedVariants, view } from "$lib/tree/state/tree.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import type { Direction, GroupFocus, Secondary } from "$lib/tree/types";
  import { TRANSITION_TIME } from "$lib/tree/utils/settings";
  import { visibleNodes } from "$lib/tree/utils/tree";
  import { formatNumber } from "$lib/format";
  import Eye from "@lucide/svelte/icons/eye";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  // Every node carries a block per attribute built, empty ones included, so the
  // root is enough to know what the tree can show.
  const attributes = $derived([
    ...Object.keys(tree.nodes[0]?.eventLevel ?? {}),
    ...(tree.nodes[0]?.transitionTime ? [TRANSITION_TIME] : [])
  ]);

  // Every control names the Groups the way the user does, and addresses them
  // by id, so a rename or a different pair changes nothing else here.
  const groups = $derived(comparedGroups());

  const secondaryOptions = $derived([
    {
      value: "cases",
      label:
        groups.length > 1 ? `Cases (${groups.map((group) => group.name).join(" · ")})` : "Cases"
    },
    ...groups.map((group) => ({ value: group.id, label: `Cases: ${group.name}` })),
    ...attributes.map((name) => ({ value: name, label: `Mean ${name}` }))
  ]);

  const focusOptions = $derived([
    { value: "all", label: "All nodes" },
    ...groups.map((group) => ({ value: group.id, label: `${group.name} only` })),
    ...(groups.length > 1 ? [{ value: "shared", label: "Shared" }] : [])
  ]);

  const focusLabel = $derived(
    focusOptions.find((option) => option.value === view.focus)?.label ?? "All nodes"
  );

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
          <Select.Trigger class="h-8 text-xs">{focusLabel}</Select.Trigger>
          <Select.Content>
            {#each focusOptions as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground text-[0.625rem]">
          Dims the rest. The tree keeps its shape.
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
          · {formatNumber(visible.variantsHidden)} hidden by these two filters, which draw less of the
          built tree without rebuilding it. The aggregates and tests still describe every variant the
          last build included.
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
