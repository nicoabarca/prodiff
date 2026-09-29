<script lang="ts">
  /**
   * What is drawn, as opposed to what was built. Nothing here triggers a
   * rebuild, so these controls stay usable while one runs.
   */
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import SettingField from "$lib/components/layout/setting-field.svelte";
  import { view } from "$lib/dfg/state/view.svelte";
  import Eye from "@lucide/svelte/icons/eye";

  let open = $state(false);

  const measureLabel = $derived(view.measure === "cases" ? "Cases" : "Events");
  const directionLabel = $derived(view.direction === "TB" ? "top down" : "left to right");
</script>

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
        {measureLabel}
        <span class="text-muted-foreground font-normal">· {directionLabel}</span>
      </SettingField>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80" align="end">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
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

      <div class="flex flex-col gap-1.5">
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
    </div>
  </Popover.Content>
</Popover.Root>
