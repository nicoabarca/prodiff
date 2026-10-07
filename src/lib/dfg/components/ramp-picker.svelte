<script lang="ts">
  /**
   * The ramp the shades are read on, from the smallest figure drawn to the
   * largest, and the grid of ramps behind it. The strip is the control: there is
   * no room beside it for a second one.
   *
   * In the Group ramp each node reads the ramp in its own Group's hue and only
   * the step is shared, so the strip itself is the Original's grey.
   */
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { RAMP_LABELS, shade, type Ramp } from "$lib/groups/utils/shade";

  let {
    low,
    high,
    value,
    options,
    onSelect
  }: {
    low: string;
    high: string;
    value: Ramp;
    options: Ramp[];
    onSelect: (ramp: Ramp) => void;
  } = $props();

  let open = $state(false);

  const STEPS = [0, 0.25, 0.5, 0.75, 1];
</script>

{#snippet strip(ramp: Ramp, width: string)}
  {#each STEPS as step (step)}
    <span class="h-full {width}" style="background:{shade('group-original', step, ramp).fill}"
    ></span>
  {/each}
{/snippet}

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label="Shade ramp: {RAMP_LABELS[value]}"
        class="flex cursor-pointer items-center gap-1.5"
      >
        <span class="text-muted-foreground shrink-0 font-mono text-[0.625rem]">{low}</span>
        <span class="hover:ring-ring flex h-2.5 shrink-0 ring-1 ring-transparent">
          {@render strip(value, "w-5")}
        </span>
        <span class="text-muted-foreground shrink-0 font-mono text-[0.625rem]">{high}</span>
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-56" align="start">
    <div class="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Shade ramp">
      {#each options as ramp (ramp)}
        <button
          type="button"
          role="radio"
          aria-checked={value === ramp}
          title={RAMP_LABELS[ramp]}
          class="flex cursor-pointer items-center gap-1.5 p-1 text-[0.6875rem] {value === ramp
            ? 'bg-accent'
            : 'hover:bg-accent/60'}"
          onclick={() => {
            onSelect(ramp);
            open = false;
          }}
        >
          <span class="ring-border flex h-3.5 shrink-0 ring-1">{@render strip(ramp, "w-2.5")}</span>
          <span class="truncate">{RAMP_LABELS[ramp]}</span>
        </button>
      {/each}
    </div>
    <p class="text-muted-foreground mt-2 text-[0.625rem]">
      An activity only one group reaches keeps that group's colour, whichever ramp is chosen. A ramp
      near a compared group's own colour is not offered.
    </p>
  </Popover.Content>
</Popover.Root>
