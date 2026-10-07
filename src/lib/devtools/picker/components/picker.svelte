<script lang="ts">
  import PickerPopup from "$lib/devtools/picker/components/picker-popup.svelte";
  import type { PickerMode } from "$lib/devtools/picker/types";
  import { labelOf } from "$lib/devtools/picker/utils/context";
  import { modeShortcut, storedMode, storeMode } from "$lib/devtools/picker/utils/mode";
  import { onMount } from "svelte";

  const POINTER_EVENTS = [
    "pointerdown",
    "pointerup",
    "pointerover",
    "pointerout",
    "pointerenter",
    "pointerleave",
    "mousedown",
    "mouseup",
    "mouseover",
    "mouseout",
    "dblclick",
    "auxclick",
    "contextmenu",
    "touchstart",
    "touchend"
  ];

  const CURSOR_CSS =
    "*, *::before, *::after { cursor: crosshair !important; }" +
    " [data-picker-ui], [data-picker-ui] * { cursor: auto !important; }" +
    " [data-picker-ui] button { cursor: pointer !important; }";

  let active = $state(false);
  let hovered = $state<Element | null>(null);
  let selected = $state<Element[]>([]);
  let popup = $state<{ x: number; y: number } | null>(null);
  let sending = $state(false);
  let mode = $state<PickerMode>(storedMode());
  let frame = $state(0);
  let ui = $state<HTMLElement | null>(null);

  // Elements ArrowUp walked out of, so ArrowDown can walk back in.
  let descended: Element[] = [];
  let pointer = { x: 0, y: 0 };

  const isUi = (target: EventTarget | null) => target instanceof Node && !!ui?.contains(target);

  const box = (element: Element) => {
    void frame;
    return element.getBoundingClientRect();
  };

  function start() {
    active = true;
  }

  function stop() {
    active = false;
    hovered = null;
    selected = [];
    closePopup();
    descended = [];
  }

  function toggle(element: Element) {
    const i = selected.indexOf(element);
    if (i === -1) selected.push(element);
    else selected.splice(i, 1);
  }

  function openPopup() {
    popup = { x: pointer.x, y: pointer.y };
  }

  function closePopup() {
    popup = null;
    sending = false;
  }

  function block(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onPointerEvent(event: Event) {
    if (isUi(event.target)) return;
    block(event);
  }

  function onPointerMove(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY };
    if (isUi(event.target)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (sending || !(event.target instanceof Element)) return;
    if (descended.length > 0 && hovered?.contains(event.target)) return;
    hovered = event.target;
    descended = [];
  }

  function onClick(event: MouseEvent) {
    if (isUi(event.target)) return;
    block(event);
    if (sending) return;
    const target = hovered ?? (event.target instanceof Element ? event.target : null);
    if (!target) return;
    if (event.shiftKey) {
      toggle(target);
      return;
    }
    if (!selected.includes(target)) selected.push(target);
    openPopup();
  }

  function onKeydown(event: KeyboardEvent) {
    const shortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k";
    if (shortcut) {
      block(event);
      if (active) stop();
      else start();
      return;
    }
    if (!active) return;

    if (event.key === "Escape") {
      block(event);
      if (popup) closePopup();
      else stop();
      return;
    }
    const shortcutMode = popup && !sending ? modeShortcut(event) : null;
    if (shortcutMode) {
      block(event);
      mode = shortcutMode;
      storeMode(mode);
      return;
    }
    if (isUi(event.target)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (sending) return;

    if (event.key === "ArrowUp" && hovered?.parentElement && hovered.parentElement !== document.body) {
      event.preventDefault();
      descended.push(hovered);
      hovered = hovered.parentElement;
    } else if (event.key === "ArrowDown" && descended.length > 0) {
      event.preventDefault();
      hovered = descended.pop() ?? hovered;
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selected.length === 0 && hovered) selected.push(hovered);
      if (selected.length > 0) openPopup();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown, true);
    return () => window.removeEventListener("keydown", onKeydown, true);
  });

  $effect(() => {
    if (!active) return;
    const style = document.createElement("style");
    style.textContent = CURSOR_CSS;
    document.head.append(style);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("click", onClick, true);
    for (const type of POINTER_EVENTS) window.addEventListener(type, onPointerEvent, true);
    let raf = requestAnimationFrame(function tick() {
      frame++;
      raf = requestAnimationFrame(tick);
    });
    return () => {
      style.remove();
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("click", onClick, true);
      for (const type of POINTER_EVENTS) window.removeEventListener(type, onPointerEvent, true);
      cancelAnimationFrame(raf);
    };
  });
</script>

{#if active}
  <div class="pointer-events-none fixed inset-0 z-2147483646">
    {#each selected as element, i (element)}
      {#if element.isConnected}
        {@const rect = box(element)}
        <div
          class="absolute border-2 border-emerald-500 bg-emerald-500/10"
          style:left="{rect.left}px"
          style:top="{rect.top}px"
          style:width="{rect.width}px"
          style:height="{rect.height}px"
        >
          <span class="absolute -top-2.5 -left-2.5 grid size-5 place-items-center rounded-full bg-emerald-600 text-[0.65rem] font-semibold text-white">
            {i + 1}
          </span>
        </div>
      {/if}
    {/each}

    {#if hovered && !sending && hovered.isConnected && !selected.includes(hovered)}
      {@const rect = box(hovered)}
      <div
        class="absolute border-2 border-dashed border-sky-500 bg-sky-500/10"
        style:left="{rect.left}px"
        style:top="{rect.top}px"
        style:width="{rect.width}px"
        style:height="{rect.height}px"
      >
        <span
          class="absolute left-0 bg-sky-600 px-1.5 py-0.5 font-mono text-[0.65rem] whitespace-nowrap text-white {rect.top < 24
            ? 'top-full'
            : 'bottom-full'}"
        >
          {labelOf(hovered)}
        </span>
      </div>
    {/if}

    {#if !popup}
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900 px-3 py-1.5 text-xs text-white shadow-lg">
        Click to select · Shift+click to add · ↑↓ parent/child · Enter to write · Esc to exit
      </div>
    {/if}
  </div>

  <div bind:this={ui} data-picker-ui class="contents">
    {#if popup}
      <PickerPopup
        x={popup.x}
        y={popup.y}
        elements={selected}
        bind:sending
        bind:mode
        onRemove={(i) => {
          selected.splice(i, 1);
          if (selected.length === 0) closePopup();
        }}
        onRetarget={(i, element) => {
          if (selected.includes(element)) selected.splice(i, 1);
          else selected[i] = element;
        }}
        onDone={stop}
      />
    {/if}
  </div>
{/if}
