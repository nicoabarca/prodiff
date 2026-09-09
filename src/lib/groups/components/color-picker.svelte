<script lang="ts">
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { GROUP_COLORS } from "$lib/groups/colors";
  import { recolorGroup } from "$lib/groups/state/groups.svelte";
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  let { group }: { group: Group } = $props();

  let open = $state(false);

  async function pick(color: string) {
    open = false;
    await recolorGroup(group, color);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="focus-visible:ring-ring size-3 shrink-0 rounded-full focus-visible:ring-1 focus-visible:outline-none"
    style="background:{colorVar(group.color)}"
    aria-label="Change group colour"
  ></Popover.Trigger>
  <Popover.Content class="w-auto p-2">
    <div class="grid grid-cols-3 gap-1.5">
      {#each GROUP_COLORS as color (color)}
        <button
          type="button"
          onclick={() => pick(color)}
          class="focus-visible:ring-ring size-6 rounded-full focus-visible:ring-1 focus-visible:outline-none {group.color ===
          color
            ? 'ring-foreground ring-2 ring-offset-2'
            : ''}"
          style="background:{colorVar(color)}"
          aria-label={color}
        ></button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
