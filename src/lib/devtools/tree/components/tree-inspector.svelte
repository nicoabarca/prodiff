<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { built } from "$lib/tree/state/build.svelte";
  import { selected } from "$lib/tree/state/tree.svelte";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import JsonNode from "$lib/devtools/tree/components/json-node.svelte";
  import { findNode, toJson, treeSummary } from "$lib/devtools/tree/utils/inspect";
  import Braces from "@lucide/svelte/icons/braces";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import GripHorizontal from "@lucide/svelte/icons/grip-horizontal";
  import X from "@lucide/svelte/icons/x";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  let open = $state(false);
  let tab = $state<"tree" | "node">("tree");
  let copied = $state(false);

  // Window position in viewport pixels, kept across open and close.
  let position = $state({ x: 96, y: 96 });
  let drag: { dx: number; dy: number } | null = null;

  function startDrag(event: PointerEvent) {
    if ((event.target as Element).closest("button")) return;
    drag = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  // Clamped so the header always stays on screen and can be grabbed again.
  function moveDrag(event: PointerEvent) {
    if (!drag) return;
    position = {
      x: Math.min(Math.max(event.clientX - drag.dx, 0), window.innerWidth - 64),
      y: Math.min(Math.max(event.clientY - drag.dy, 0), window.innerHeight - 32)
    };
  }

  function endDrag() {
    drag = null;
  }

  // Window size in viewport pixels, changed from the corner handle.
  const MIN_WIDTH = 384;
  const MIN_HEIGHT = 192;
  let size = $state({ width: 640, height: 448 });
  let resizing: { x: number; y: number; width: number; height: number } | null = null;

  function startResize(event: PointerEvent) {
    resizing = { x: event.clientX, y: event.clientY, ...size };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent) {
    if (!resizing) return;
    size = {
      width: Math.max(resizing.width + event.clientX - resizing.x, MIN_WIDTH),
      height: Math.max(resizing.height + event.clientY - resizing.y, MIN_HEIGHT)
    };
  }

  function endResize() {
    resizing = null;
  }

  const node = $derived(findNode(tree, selected.id));
  const shown = $derived(tab === "node" ? node : tree);

  $effect(() => {
    if (node === null && tab === "node") tab = "tree";
  });

  // Exposes the payload to the devtools console as `window.__tree`.
  $effect(() => {
    (window as unknown as { __tree?: ResponseDirectedTree }).__tree = tree;
  });

  async function copy() {
    await navigator.clipboard.writeText(toJson(shown));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<Button
  variant="outline"
  size="icon"
  class="bg-background/90 absolute bottom-3 left-14 z-10 backdrop-blur"
  aria-label="Toggle tree JSON inspector"
  aria-pressed={open}
  data-devtools="tree-inspector"
  onclick={() => (open = !open)}
>
  <Braces />
</Button>

{#if open}
  <div
    role="dialog"
    aria-label="Tree JSON inspector"
    class="border-border bg-background fixed z-50 flex flex-col overflow-hidden border shadow-lg"
    style="left:{position.x}px;top:{position.y}px;width:{size.width}px;height:{size.height}px"
  >
    <Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col gap-0">
      <div
        role="presentation"
        class="border-border flex shrink-0 cursor-move items-center gap-3 border-b px-3 py-1.5 select-none"
        onpointerdown={startDrag}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      >
        <GripHorizontal class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <Tabs.List>
          <Tabs.Trigger value="tree">Tree</Tabs.Trigger>
          <Tabs.Trigger value="node" disabled={node === null}>
            Node {node ? `#${node.id}` : ""}
          </Tabs.Trigger>
        </Tabs.List>
        <p class="text-muted-foreground min-w-0 truncate font-mono text-xs">
          {treeSummary(tree, built.key)}
        </p>
        <div class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onclick={copy}>
            {#if copied}
              <Check data-icon="inline-start" />
              Copied
            {:else}
              <Copy data-icon="inline-start" />
              Copy
            {/if}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close inspector"
            onclick={() => (open = false)}
          >
            <X />
          </Button>
        </div>
      </div>
      <!-- `min-h-0` lets the tree scroll inside the window instead of growing it. -->
      <div class="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
        {#key tab === "node" ? `node:${node?.id}` : "tree"}
          <JsonNode
            name={tab === "node" ? `node #${node?.id}` : "tree"}
            value={shown}
            openDepth={tab === "node" ? 2 : 1}
          />
        {/key}
      </div>
    </Tabs.Root>
    <!-- Sits over the tree's scrollbar corner, which would otherwise take the drag. -->
    <div
      role="presentation"
      class="border-muted-foreground absolute right-0 bottom-0 z-10 size-4 cursor-se-resize touch-none border-r-2 border-b-2"
      onpointerdown={startResize}
      onpointermove={moveResize}
      onpointerup={endResize}
      onpointercancel={endResize}
    ></div>
  </div>
{/if}
