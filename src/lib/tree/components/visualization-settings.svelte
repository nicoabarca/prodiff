<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Nothing here triggers a
   * rebuild, so these controls stay usable while one runs.
   */
  import { TRANSITION_TIME, isDurationAttribute } from "$lib/analysis/attributes";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import Segmented from "$lib/components/layout/segmented.svelte";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import FigureName from "$lib/tree/components/figure-name.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import { resetDisplay, view } from "$lib/tree/state/tree.svelte";
  import type { NodeMetric } from "$lib/tree/types";
  import { figureAttributes, nodeFigure, type FigureAttribute } from "$lib/tree/utils/figure";
  import Eye from "@lucide/svelte/icons/eye";
  import { cn } from "$lib/utils";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  let open = $state(false);

  const attributes = $derived(figureAttributes(tree));
  const figure = $derived(nodeFigure(view, attributes));
  const numbers = $derived(attributes.filter((attribute) => attribute.kind === "number"));
  const categories = $derived(attributes.filter((attribute) => attribute.kind === "category"));

  const metric = $derived<NodeMetric>(
    figure.kind === "cases" || figure.kind === "share" ? figure.kind : "attribute"
  );

  const hasTransitionTime = $derived(
    attributes.some((attribute) => attribute.name === TRANSITION_TIME)
  );
  const edgeLabels = $derived(view.edgeLabels && hasTransitionTime);
  const hasAttributes = $derived(attributes.length > 0);

  // Every control names the Groups the way the user does, and addresses them
  // by id, so a rename or a different pair changes nothing else here.
  const groups = $derived(comparedGroups());

  const focusOptions = $derived([
    { value: "all", label: "All" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
      title: group.name,
      dot: `var(--${group.color})`
    })),
    { value: "shared", label: "Shared" }
  ]);
  const focus = $derived(
    focusOptions.some((option) => option.value === view.focus) ? view.focus : "all"
  );

  function chooseMetric(value: NodeMetric) {
    view.metric = value;
    if (value === "attribute" && view.attribute === null) {
      view.attribute = attributes[0]?.name ?? null;
    }
  }

  $effect(() => {
    if (!hasAttributes) view.significantOnly = false;
  });
</script>

{#snippet heading(title: string)}
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground text-[0.625rem] font-semibold tracking-wide">{title}</span>
    <span class="bg-border h-px flex-1"></span>
  </div>
{/snippet}

{#snippet chips(options: FigureAttribute[])}
  <div class="flex flex-wrap gap-1">
    {#each options as option (option.name)}
      {@const on = figure.kind === option.kind && figure.name === option.name}
      <button
        type="button"
        aria-pressed={on}
        class={cn(
          "h-5.5 max-w-full cursor-pointer truncate border px-2 text-[0.6875rem]",
          !isDurationAttribute(option.name) && "font-mono",
          on
            ? "bg-card border-foreground text-foreground font-semibold"
            : "border-border text-muted-foreground hover:text-foreground font-medium"
        )}
        onclick={() => (view.attribute = option.name)}
      >
        <AttributeName name={option.name} />{#if option.kind === "category"}{" "}= {option.value}{/if}
      </button>
    {/each}
  </div>
{/snippet}

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <SettingField
        {...props}
        icon={Eye}
        caption="Display · no rebuild"
        {open}
        class="shrink-0 border-r-0 border-l pr-4"
      >
        <FigureName {figure} statistic={view.statistic} short />
        <span class="text-muted-foreground font-normal">
          · {edgeLabels ? `${view.statistic} wait on edges` : "no edge labels"}
        </span>
      </SettingField>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="end" collisionPadding={8} class="w-84 gap-3.5 p-3">
    <div class="flex flex-col gap-2.5">
      {@render heading("Nodes")}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium">Figure under the name</span>
        <Segmented
          label="Figure under the name"
          value={metric}
          options={[
            { value: "cases" as const, label: "Cases" },
            { value: "share" as const, label: "% of group" },
            {
              value: "attribute" as const,
              label: "Attribute",
              disabled: !hasAttributes,
              title: hasAttributes ? undefined : "Build with at least one attribute to show this."
            }
          ]}
          onchange={chooseMetric}
        />
        {#if metric === "attribute"}
          <div class="bg-muted/60 border-border flex flex-col gap-1.5 border p-2">
            {#if numbers.length > 0}
              <span class="text-muted-foreground text-[0.625rem]">Numbers</span>
              {@render chips(numbers)}
            {/if}
            {#if categories.length > 0}
              <span class="text-muted-foreground text-[0.625rem]">
                Categories · share of cases with one value
              </span>
              {@render chips(categories)}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      {@render heading("Edges")}
      <div class="grid grid-cols-2 gap-2.5">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Label</span>
          <Segmented
            label="Edge label"
            value={edgeLabels ? "waiting" : "off"}
            options={[
              { value: "off", label: "Off" },
              {
                value: "waiting",
                label: "Waiting time",
                disabled: !hasTransitionTime,
                title: hasTransitionTime
                  ? undefined
                  : "Build with Waiting Time selected to show this."
              }
            ]}
            onchange={(value) => (view.edgeLabels = value === "waiting")}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Width</span>
          <Segmented
            label="Edge width"
            value={view.edgeWidth}
            options={[
              { value: "cases" as const, label: "Cases" },
              { value: "uniform" as const, label: "Uniform" }
            ]}
            onchange={(value) => (view.edgeWidth = value)}
          />
        </div>
      </div>
    </div>

    <div
      class={cn("flex flex-col gap-1.5", !edgeLabels && figure.kind !== "number" && "opacity-45")}
    >
      {@render heading("Statistic")}
      <Segmented
        label="Statistic"
        value={view.statistic}
        options={[
          { value: "mean" as const, label: "Mean" },
          { value: "median" as const, label: "Median" }
        ]}
        onchange={(value) => (view.statistic = value)}
      />
    </div>

    <div class="flex flex-col gap-2.5">
      {@render heading("Focus · draws less, never rebuilds")}
      {#if groups.length > 1}
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Emphasize steps taken by</span>
          <Segmented
            label="Emphasize steps taken by"
            value={focus}
            options={focusOptions}
            onchange={(value) => (view.focus = value)}
          />
        </div>
      {/if}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium">Variants</span>
        <Segmented
          label="Variants"
          value={view.significantOnly ? "finding" : "all"}
          options={[
            { value: "all", label: "All" },
            {
              value: "finding",
              label: "With a finding",
              disabled: !hasAttributes,
              title: hasAttributes
                ? undefined
                : "Build with at least one attribute to use this filter."
            }
          ]}
          onchange={(value) => (view.significantOnly = value === "finding")}
        />
      </div>
    </div>

    <div class="border-border flex items-center gap-2 border-t pt-2">
      {#if view.collapsed.size > 0}
        <Button
          variant="ghost"
          size="xs"
          class="text-[0.625rem]"
          onclick={() => (view.collapsed = new Set())}
        >
          Expand all ({view.collapsed.size} collapsed)
        </Button>
      {/if}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground ml-auto cursor-pointer text-[0.625rem] underline"
        onclick={resetDisplay}
      >
        Reset to defaults
      </button>
    </div>
  </Popover.Content>
</Popover.Root>
