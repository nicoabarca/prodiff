<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import type { Tier, TuningField } from "$lib/components/tuning-form/types";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import X from "@lucide/svelte/icons/x";

  let {
    title,
    id,
    fields,
    values,
    activeTier,
    tier = $bindable(),
    onChange,
    onReset,
    actions
  }: {
    title: string;
    id: string;
    fields: TuningField[];
    values: Record<string, unknown>;
    activeTier: Tier;
    tier: Tier | null;
    onChange: (key: string, value: unknown) => void;
    onReset: () => void;
    actions?: Snippet<[{ copy: (label: string, text: string) => void; copied: string | null }]>;
  } = $props();

  const editing = $derived(tier ?? activeTier);

  let open = $state(false);
  let copied = $state<string | null>(null);
  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    copied = label;
    setTimeout(() => (copied = null), 1500);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm">
        <SlidersHorizontal data-icon="inline-start" />
        {title}
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    class="max-h-[80vh] w-96 space-y-4 overflow-y-auto"
    align="end"
    interactOutsideBehavior="ignore"
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium">{title}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Close" onclick={() => (open = false)}>
        <X />
      </Button>
    </div>
    <div class="space-y-1.5">
      <Label class="text-xs">Editing tuning for</Label>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={editing}
        onValueChange={(value) => {
          if (value) tier = value as Tier;
        }}
      >
        <ToggleGroup.Item value="compact">Compact</ToggleGroup.Item>
        <ToggleGroup.Item value="spaghetti">Spaghetti</ToggleGroup.Item>
      </ToggleGroup.Root>
      <p class="text-muted-foreground text-[0.6875rem]">
        This graph uses the {activeTier} tuning.
        {#if editing !== activeTier}
          Changes here will not show until the graph crosses the threshold.
        {/if}
      </p>
    </div>

    <Separator />

    {#each fields as field (field.key)}
      {#if field.kind === "choice"}
        <div class="space-y-1.5">
          <Label class="text-xs">{field.label}</Label>
          <ToggleGroup.Root
            type="single"
            size="sm"
            variant="outline"
            class="flex-wrap"
            value={String(values[field.key])}
            onValueChange={(value) => {
              if (value) onChange(field.key, value);
            }}
          >
            {#each field.options as option (option)}
              <ToggleGroup.Item value={option}>{option}</ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </div>
      {:else if field.kind === "range"}
        {@const value = values[field.key] as number}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <Label class="text-xs">{field.label}</Label>
            <span class="font-mono text-xs">{field.format ? field.format(value) : value}</span>
          </div>
          <Slider
            type="single"
            {value}
            onValueChange={(next: number) => onChange(field.key, next)}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <Checkbox
            id="{id}-{field.key}"
            checked={values[field.key] === true}
            onCheckedChange={(checked) => onChange(field.key, checked === true)}
          />
          <Label for="{id}-{field.key}" class="text-xs font-normal">{field.label}</Label>
        </div>
      {/if}
    {/each}

    <Separator />

    <div class="flex flex-wrap gap-2">
      {@render actions?.({ copy, copied })}
      <Button variant="ghost" size="sm" onclick={onReset}>Reset {editing}</Button>
    </div>
  </Popover.Content>
</Popover.Root>
