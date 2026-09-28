<!--
  @component
  The export button in a Svelte Flow's Controls, with a popover to choose the
  image format and size. Must sit inside a SvelteFlow. `exporting` is true while
  the image renders; the canvas turns `onlyRenderVisibleElements` off for it, so
  nodes panned out of view are in the DOM to be drawn.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { ControlButton, useStore, useSvelteFlow } from "@xyflow/svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  import { toast } from "svelte-sonner";
  import ImageDown from "@lucide/svelte/icons/image-down";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { capture } from "./capture";
  import { frame, MAX_SIDE, validSide, type ImageFormat } from "./frame";

  let { name, exporting = $bindable(false) }: { name: string; exporting?: boolean } = $props();

  const FORMATS: { value: ImageFormat; label: string; extension: string }[] = [
    { value: "png", label: "PNG", extension: "png" },
    { value: "jpeg", label: "JPEG", extension: "jpg" },
    { value: "svg", label: "SVG", extension: "svg" }
  ];

  const flow = useSvelteFlow();
  const store = useStore();

  let open = $state(false);
  let format = $state<ImageFormat>("png");
  let sizing = $state<"auto" | "custom">("auto");
  let width = $state(1920);
  let height = $state(1080);

  const valid = $derived(sizing === "auto" || (validSide(width) && validSide(height)));

  /** Waits for nodes mounted by turning culling off to render and be measured. */
  async function settle() {
    await tick();
    for (let frames = 0; frames < 3; frames++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await tick();
  }

  async function download() {
    const chosen = FORMATS.find((one) => one.value === format) ?? FORMATS[0];
    const viewport = store.domNode?.querySelector<HTMLElement>(".svelte-flow__viewport");
    if (!viewport) return;

    const path = await save({
      defaultPath: `${name}.${chosen.extension}`,
      filters: [{ name: `${chosen.label} image`, extensions: [chosen.extension] }]
    });
    if (!path) return;

    open = false;
    exporting = true;
    try {
      await settle();
      const bounds = flow.getNodesBounds(flow.getNodes());
      const placed = frame(bounds, sizing === "auto" ? null : { width, height });
      const background = getComputedStyle(document.body).backgroundColor;
      const bytes = await capture(viewport, format, placed, background);
      await writeFile(path, bytes);
      toast.success("Image saved", { description: path });
    } catch (error) {
      toast.error("Could not save the image", { description: String(error) });
    } finally {
      exporting = false;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <ControlButton
        {...props}
        title="Export image"
        aria-label="Export image"
        disabled={exporting}
      >
        <ImageDown />
      </ControlButton>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64 space-y-4" side="right" align="end">
    <div class="space-y-1.5">
      <Label class="text-xs">Format</Label>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={format}
        onValueChange={(value) => {
          if (value) format = value as ImageFormat;
        }}
      >
        {#each FORMATS as one (one.value)}
          <ToggleGroup.Item value={one.value}>{one.label}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs">Size</Label>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={sizing}
        onValueChange={(value) => {
          if (value) sizing = value as typeof sizing;
        }}
      >
        <ToggleGroup.Item value="auto">Auto</ToggleGroup.Item>
        <ToggleGroup.Item value="custom">Custom</ToggleGroup.Item>
      </ToggleGroup.Root>
      {#if sizing === "auto"}
        <p class="text-muted-foreground text-xs">Fits the whole graph at full detail.</p>
      {:else}
        <div class="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={MAX_SIDE}
            step={1}
            bind:value={width}
            aria-label="Width in pixels"
            class="h-7"
          />
          <span class="text-muted-foreground text-xs">×</span>
          <Input
            type="number"
            min={1}
            max={MAX_SIDE}
            step={1}
            bind:value={height}
            aria-label="Height in pixels"
            class="h-7"
          />
          <span class="text-muted-foreground text-xs">px</span>
        </div>
        {#if !valid}
          <p class="text-destructive text-xs">Width and height must be 1 to {MAX_SIDE} pixels.</p>
        {/if}
      {/if}
    </div>

    <Button size="sm" class="w-full" disabled={!valid || exporting} onclick={download}>
      <ImageDown data-icon="inline-start" />
      Export
    </Button>
  </Popover.Content>
</Popover.Root>
