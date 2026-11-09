<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Nothing here triggers a
   * rebuild, so these controls stay usable while one runs, and a split draws
   * both panels from the same choices.
   */
  import Segmented from "$lib/components/layout/segmented.svelte";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import { resetDisplay, view } from "$lib/dfg/state/view.svelte";
  import {
    builtDurations,
    displayCaption,
    shownEdgeLabel,
    shownFigure
  } from "$lib/dfg/utils/display";
  import Eye from "@lucide/svelte/icons/eye";
  import { cn } from "$lib/utils";

  let { graph }: { graph: ResponseDfg | null } = $props();

  let open = $state(false);

  const built = $derived(builtDurations(graph));
  const figure = $derived(shownFigure(view.figure, built));
  const edgeLabel = $derived(shownEdgeLabel(view.edgeLabel, built));
  const caption = $derived(displayCaption(view, built));
  const durationShown = $derived(figure === "serviceTime" || edgeLabel === "waiting");
</script>

{#snippet heading(title: string)}
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground text-[0.625rem] font-semibold tracking-wide">{title}</span>
    <span class="bg-border h-px flex-1"></span>
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
        {caption.figure}
        <span class="text-muted-foreground font-normal">· {caption.edges}</span>
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
          value={figure}
          options={[
            { value: "cases" as const, label: "Cases" },
            { value: "events" as const, label: "Events" },
            {
              value: "serviceTime" as const,
              label: "Service Time",
              disabled: !built.serviceTime,
              title: built.serviceTime
                ? undefined
                : "Build with Service Time selected to show this."
            }
          ]}
          onchange={(value) => (view.figure = value)}
        />
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
            { value: "frequency" as const, label: "Frequency" },
            {
              value: "waiting" as const,
              label: "Waiting time",
              disabled: !built.waiting,
              title: built.waiting ? undefined : "Build with Waiting Time selected to show this."
            }
          ]}
          onchange={(value) => (view.edgeLabel = value)}
        />
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
        Count shades activities, thickens edges and is what Frequency prints.
      </span>
    </div>

    <div class={cn("flex flex-col gap-1.5", !durationShown && "opacity-45")}>
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
