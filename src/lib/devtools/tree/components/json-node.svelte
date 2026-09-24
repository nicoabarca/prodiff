<script lang="ts">
  import { untrack } from "svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import Self from "$lib/devtools/tree/components/json-node.svelte";
  import {
    branchPreview,
    childrenOf,
    formatPrimitive,
    isDurationPath,
    kindOf
  } from "$lib/devtools/tree/utils/inspect";
  import { formatDuration } from "$lib/format";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";

  /**
   * `openDepth` is how many levels below this one start expanded. `path` is the
   * keys from the inspected root down to this value, its own key included.
   */
  let {
    name,
    value,
    openDepth = 0,
    path = []
  }: { name: string; value: unknown; openDepth?: number; path?: string[] } = $props();

  const duration = $derived(typeof value === "number" && isDurationPath(path));

  const kind = $derived(kindOf(value));
  const branch = $derived(kind === "object" || kind === "array");
  // Seeded once; the user's toggles own it afterwards.
  let expanded = $state(untrack(() => openDepth > 0));

  // Expand all and Collapse all reseed the children by remounting them at a new depth.
  let childDepth = $state(untrack(() => openDepth - 1));
  let generation = $state(0);

  function expandAll() {
    expanded = true;
    childDepth = Infinity;
    generation++;
  }

  function collapseAll() {
    expanded = false;
    childDepth = 0;
    generation++;
  }

  const valueClass: Record<string, string> = {
    string: "text-emerald-700 dark:text-emerald-400",
    number: "text-blue-700 dark:text-blue-400",
    boolean: "text-amber-700 dark:text-amber-400",
    null: "text-muted-foreground italic"
  };
</script>

{#if branch}
  <ContextMenu.Root>
    <ContextMenu.Trigger class="block">
      <button
        type="button"
        class="hover:bg-muted flex w-full items-center gap-1 text-left"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        {#if expanded}
          <ChevronDown class="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
        {:else}
          <ChevronRight class="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
        {/if}
        <span>{name}</span>
        <span class="text-muted-foreground">{branchPreview(value)}</span>
      </button>
    </ContextMenu.Trigger>
    <ContextMenu.Content>
      <ContextMenu.Item onSelect={expandAll}>
        <ChevronsUpDown />
        Expand all
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={collapseAll}>
        <ChevronsDownUp />
        Collapse all
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
  <!-- Children render only once expanded, so a large payload opens collapsed and cheap. -->
  {#if expanded}
    <div class="border-border ml-1.5 border-l pl-2">
      {#key generation}
        {#each childrenOf(value) as [key, child] (key)}
          <Self name={key} value={child} openDepth={childDepth} path={[...path, key]} />
        {/each}
      {/key}
    </div>
  {/if}
{:else}
  <div class="flex gap-1 pl-4">
    <span class="shrink-0">{name}:</span>
    <span class="break-all {valueClass[kind]}">{formatPrimitive(value)}</span>
    {#if duration}
      <span class="text-muted-foreground">({formatDuration(value as number)})</span>
    {/if}
  </div>
{/if}
