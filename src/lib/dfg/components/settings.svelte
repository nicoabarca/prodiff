<script lang="ts">
  /** How the graph is drawn: what the faces count and which way it flows. */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { view } from "$lib/dfg/state/view.svelte";
  import Settings2 from "@lucide/svelte/icons/settings-2";
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
  </Popover.Content>
</Popover.Root>
