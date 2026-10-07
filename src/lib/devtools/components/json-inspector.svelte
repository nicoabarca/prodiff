<script lang="ts" module>
  /**
   * One tab of the inspector. `name` labels the root of the JSON tree and
   * `openDepth` is how many levels of it start expanded. A change of `name`
   * remounts the tree, so a tab following a selection opens fresh on each pick.
   */
  export interface InspectorTab {
    value: string;
    label: string;
    name: string;
    data: unknown;
    openDepth: number;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import JsonNode from "$lib/devtools/components/json-node.svelte";
  import { toJson } from "$lib/devtools/utils/json";
  import Braces from "@lucide/svelte/icons/braces";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import GripHorizontal from "@lucide/svelte/icons/grip-horizontal";
  import X from "@lucide/svelte/icons/x";

  /** `id` is the `data-devtools` hook on the toggle; `title` names the window. */
  let {
    id,
    title,
    tabs,
    summary
  }: { id: string; title: string; tabs: InspectorTab[]; summary: string } = $props();

  let open = $state(false);
  let tab = $state("");
  let copied = $state(false);

  // Falls back to the first tab when the current one is disabled or gone.
  $effect(() => {
    const current = tabs.find((candidate) => candidate.value === tab);
    if (!current || current.disabled) tab = tabs[0]?.value ?? "";
  });

  const shown = $derived(tabs.find((candidate) => candidate.value === tab) ?? tabs[0]);

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

  async function copy() {
    await navigator.clipboard.writeText(toJson(shown?.data));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<Button
  variant="outline"
  size="icon"
  class="bg-background/90 absolute bottom-3 left-14 z-10 backdrop-blur"
  aria-label="Toggle {title}"
  aria-pressed={open}
  data-devtools={id}
  onclick={() => (open = !open)}
>
  <Braces />
</Button>

{#if open}
  <div
    role="dialog"
    aria-label={title}
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
          {#each tabs as option (option.value)}
            <Tabs.Trigger value={option.value} disabled={option.disabled}>
              {option.label}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
        <p class="text-muted-foreground min-w-0 truncate font-mono text-xs">{summary}</p>
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
        {#if shown}
          {#key `${shown.value}:${shown.name}`}
            <JsonNode name={shown.name} value={shown.data} openDepth={shown.openDepth} />
          {/key}
        {/if}
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
