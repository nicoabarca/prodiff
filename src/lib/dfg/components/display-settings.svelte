<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Nothing here triggers a
   * rebuild, so these controls stay usable while one runs, and a split draws
   * both panels from the same choices.
   */
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import Segmented from "$lib/components/layout/segmented.svelte";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { resetDisplay, splitting, view } from "$lib/dfg/state/view.svelte";
  import type { NodeMetric } from "$lib/dfg/types";
  import { builtAttributes, edgeCaption, shownEdgeLabel } from "$lib/dfg/utils/display";
  import { figureAttributes, nodeFigure, type FigureAttribute } from "$lib/dfg/utils/figure";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import FigureName from "$lib/tree/components/figure-name.svelte";
  import Eye from "@lucide/svelte/icons/eye";
  import { cn } from "$lib/utils";

  let { graph, onChooseAttributes }: { graph: ResponseDfg | null; onChooseAttributes: () => void } =
    $props();

  let open = $state(false);

  const built = $derived(builtAttributes(graph));
  const attributes = $derived(figureAttributes(graph));
  const figure = $derived(nodeFigure(view, attributes));
  const numbers = $derived(attributes.filter((attribute) => attribute.kind === "number"));
  const categories = $derived(attributes.filter((attribute) => attribute.kind === "category"));
  const hasAttributes = $derived(attributes.length > 0);

  const metric = $derived<NodeMetric>(
    figure.kind === "number" || figure.kind === "category" ? "attribute" : figure.kind
  );
  const edgeLabel = $derived(shownEdgeLabel(view.edgeLabel, built));
  const statisticShown = $derived(figure.kind === "number" || edgeLabel === "waiting");

  const groups = $derived(comparedGroups());
  const comparing = $derived(groups.length > 1);
  const split = $derived(splitting(groups.length));

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
  const emphasis = $derived(
    focusOptions.some((option) => option.value === view.emphasis) ? view.emphasis : "all"
  );

  $effect(() => {
    if (!comparing) view.findingsOnly = false;
  });

  function chooseMetric(value: NodeMetric) {
    view.figure = value;
    if (value === "attribute" && view.attribute === null) {
      view.attribute = attributes[0]?.name ?? null;
    }
  }

  function chooseAttributes() {
    open = false;
    onChooseAttributes();
  }
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
        {#if figure.kind === "events"}
          Events
        {:else}
          <FigureName {figure} statistic={view.statistic} short />
        {/if}
        <span class="text-muted-foreground font-normal">· {edgeCaption(view, built)}</span>
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
            { value: "events" as const, label: "Events" },
            {
              value: "share" as const,
              label: "% of group",
              title: "The share of the group's cases that reach the activity."
            },
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
        {:else if !hasAttributes}
          <span class="text-muted-foreground text-[0.625rem]">
            No attribute was built to show here.
            <button
              type="button"
              class="hover:text-foreground cursor-pointer underline"
              onclick={chooseAttributes}
            >
              Choose attributes
            </button>
          </span>
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      {@render heading("Edges")}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium">Label</span>
        <Segmented
          label="Edge label"
          value={edgeLabel}
          options={[
            { value: "off" as const, label: "Off" },
            {
              value: "frequency" as const,
              label: "Cases",
              title: "The cases that follow each edge."
            },
            {
              value: "share" as const,
              label: "% followed",
              title: "Of the cases reaching the edge's source, the share that follow it."
            },
            {
              value: "waiting" as const,
              label: "Waiting time",
              disabled: !built.waiting,
              title: built.waiting ? undefined : "Build with Waiting Time selected to show this."
            }
          ]}
          onchange={(value) => (view.edgeLabel = value)}
        />
        {#if (edgeLabel === "frequency" || edgeLabel === "share") && !built.edgeFrequency}
          <span class="text-muted-foreground text-[0.625rem]">
            Edges stay grey until Edge Frequency is built.
            <button
              type="button"
              class="hover:text-foreground cursor-pointer underline"
              onclick={chooseAttributes}
            >
              Choose attributes
            </button>
          </span>
        {/if}
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Count</span>
          <Segmented
            label="Count"
            value={view.measure}
            options={[
              { value: "cases" as const, label: "Cases" },
              { value: "events" as const, label: "Events" }
            ]}
            onchange={(value) => (view.measure = value)}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Width</span>
          <Segmented
            label="Edge width"
            value={view.edgeWidth}
            options={[
              { value: "scaled" as const, label: "By count" },
              { value: "uniform" as const, label: "Uniform" }
            ]}
            onchange={(value) => (view.edgeWidth = value)}
          />
        </div>
      </div>
      <span class="text-muted-foreground text-[0.625rem]">
        Count shades activities and thickens edges.
      </span>
    </div>

    <div class={cn("flex flex-col gap-1.5", !statisticShown && "opacity-45")}>
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
      {@render heading("Focus · fades, never rebuilds")}
      {#if comparing}
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium">Emphasize what is reached by</span>
          {#if split}
            <span class="text-muted-foreground text-[0.625rem]">
              Each panel already draws one group.
            </span>
          {:else}
            <Segmented
              label="Emphasize what is reached by"
              value={emphasis}
              options={focusOptions}
              onchange={(value) => (view.emphasis = value)}
            />
          {/if}
        </div>
      {/if}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium">Activities and edges</span>
        <Segmented
          label="Activities and edges"
          value={view.findingsOnly ? "finding" : "all"}
          options={[
            { value: "all", label: "All" },
            {
              value: "finding",
              label: "With a finding",
              disabled: !comparing,
              title: comparing
                ? "Fades activities without a significant difference, and edges without one in the test they are coloured by."
                : "Compare two groups to use this."
            }
          ]}
          onchange={(value) => (view.findingsOnly = value === "finding")}
        />
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      {@render heading("Layout")}
      <Segmented
        label="Direction"
        value={view.direction}
        options={[
          { value: "TB" as const, label: "Top down" },
          { value: "LR" as const, label: "Left to right" }
        ]}
        onchange={(value) => (view.direction = value)}
      />
    </div>

    <div class="border-border flex items-center border-t pt-2">
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
