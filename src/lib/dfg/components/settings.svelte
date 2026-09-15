<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { attributeOptions } from "$lib/analysis/attributes";
  import { selection, setAttributes } from "$lib/dfg/state/dfg.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import type { Project } from "$lib/event-log/types";
  import Settings2 from "@lucide/svelte/icons/settings-2";

  let { project }: { project: Project } = $props();

  const options = $derived(attributeOptions(project.columns, project.hiddenColumns));

  $effect(() => {
    const available = new Set(options);
    const kept = selection.attributes.filter((attribute) => available.has(attribute));
    if (kept.length !== selection.attributes.length) setAttributes(kept);
  });

  function toggle(name: string) {
    const next = new Set(selection.attributes);
    if (!next.delete(name)) next.add(name);
    setAttributes([...next]);
  }
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm">
        <Settings2 data-icon="inline-start" />
        Graph
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80 space-y-4" align="end">
    <div class="space-y-1.5">
      <Label class="text-xs">Faces show</Label>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={view.measure}
        onValueChange={(value) => {
          if (value) view.measure = value as typeof view.measure;
        }}
      >
        <ToggleGroup.Item value="cases">Cases</ToggleGroup.Item>
        <ToggleGroup.Item value="events">Events</ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs">Direction</Label>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={view.direction}
        onValueChange={(value) => {
          if (value) view.direction = value as typeof view.direction;
        }}
      >
        <ToggleGroup.Item value="TB">Top down</ToggleGroup.Item>
        <ToggleGroup.Item value="LR">Left to right</ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>

    <Separator />

    <div class="space-y-2">
      <Label class="text-xs">Attributes to test</Label>
      <p class="text-muted-foreground text-[0.6875rem]">
        Changing these rebuilds the graph. The sliders above never do.
      </p>
      <div class="max-h-48 space-y-1.5 overflow-y-auto">
        {#each options as option (option)}
          <div class="flex items-center gap-2">
            <Checkbox
              id="dfg-attr-{option}"
              checked={selection.attributes.includes(option)}
              onCheckedChange={() => toggle(option)}
            />
            <Label for="dfg-attr-{option}" class="text-xs font-normal">{option}</Label>
          </div>
        {/each}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
