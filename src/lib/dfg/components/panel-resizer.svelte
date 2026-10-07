<script lang="ts">
  /**
   * Drags a right-hand panel wider or narrower. `width` is in rem and is
   * clamped, so the canvas always keeps room. Dragging left widens, which is
   * why the pointer's travel is subtracted.
   */
  let {
    width = $bindable(),
    min = 20,
    max = 56,
    label
  }: { width: number; min?: number; max?: number; label: string } = $props();

  const STEP = 2;

  /** The rem the browser is actually drawing, so a zoomed page still tracks. */
  function rem(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  function clamp(value: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function onpointerdown(event: PointerEvent) {
    event.preventDefault();
    const handle = event.currentTarget as HTMLButtonElement;
    const startX = event.clientX;
    const startWidth = width;
    const unit = rem();
    handle.setPointerCapture(event.pointerId);

    const move = (moved: PointerEvent) => {
      width = clamp(startWidth + (startX - moved.clientX) / unit);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") width = clamp(width + STEP);
    else if (event.key === "ArrowRight") width = clamp(width - STEP);
    else return;
    event.preventDefault();
  }
</script>

<button
  type="button"
  aria-label={label}
  class="hover:bg-ring/60 focus-visible:bg-ring absolute top-0 left-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize focus-visible:outline-none"
  {onpointerdown}
  {onkeydown}
></button>
