<script lang="ts">
  /**
   * The ordered activities a Variant has to run through to stay in the list.
   * Steps need not be adjacent, so the sequence reads as "then", not "next".
   */
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";

  let { options, sequence = $bindable() }: { options: string[]; sequence: string[] } = $props();

  let open = $state(false);
  let query = $state("");
  let dragging = $state<number | null>(null);

  const matches = $derived(
    options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
  );

  function add(activity: string) {
    sequence = [...sequence, activity];
    query = "";
    open = false;
  }

  function remove(index: number) {
    sequence = sequence.filter((_, i) => i !== index);
  }

  function drop(target: number) {
    const from = dragging;
    dragging = null;
    if (from === null || from === target) return;
    const next = [...sequence];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    sequence = next;
  }
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex flex-wrap items-center gap-1" role="list">
    {#each sequence as activity, index (index)}
      {#if index > 0}
        <span class="text-muted-foreground text-[0.625rem]">then</span>
      {/if}
      <span
        role="listitem"
        draggable="true"
        ondragstart={() => (dragging = index)}
        ondragover={(event) => event.preventDefault()}
        ondrop={() => drop(index)}
        ondragend={() => (dragging = null)}
        class="bg-secondary text-secondary-foreground flex max-w-40 cursor-grab items-center gap-1 rounded px-1.5 py-0.5 text-xs {dragging ===
        index
          ? 'opacity-50'
          : ''}"
        title={activity}
      >
        <span class="truncate">{activity}</span>
        <button
          class="text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Remove {activity} from the sequence"
          onclick={() => remove(index)}
        >
          <X class="size-3" />
        </button>
      </span>
    {/each}

    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="text-muted-foreground hover:bg-accent hover:text-foreground flex cursor-pointer items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-xs"
          >
            <Plus class="size-3" />
            {sequence.length === 0 ? "Filter by sequence" : "then"}
          </button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="start" class="flex w-64 flex-col gap-2 p-2">
        <Input
          bind:value={query}
          placeholder="Find an activity"
          class="h-7 text-xs"
          onkeydown={(event) => {
            if (event.key === "Enter" && matches[0]) add(matches[0]);
          }}
        />
        <div class="flex max-h-64 flex-col overflow-y-auto">
          {#each matches as option (option)}
            <button
              class="hover:bg-accent cursor-pointer truncate rounded px-2 py-1 text-left text-xs"
              onclick={() => add(option)}
            >
              {option}
            </button>
          {:else}
            <p class="text-muted-foreground px-2 py-1 text-xs">No activity matches.</p>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>

    {#if sequence.length > 0}
      <button
        class="text-muted-foreground hover:text-foreground ml-auto cursor-pointer text-[0.625rem] underline"
        onclick={() => (sequence = [])}
      >
        Clear sequence
      </button>
    {/if}
  </div>

  {#if sequence.length > 1}
    <p class="text-muted-foreground text-[0.625rem]">
      Variants running through these activities in this order, other steps allowed in between.
    </p>
  {/if}
</div>
