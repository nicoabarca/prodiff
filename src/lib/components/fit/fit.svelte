<script lang="ts">
  /**
   * Text of unknown length on one line of fixed width. It ends in an ellipsis
   * when it does not fit, and shows the whole text in a tooltip on hover or
   * keyboard focus, only while it is cut. Inside a button or a link,
   * pass `focusable={false}` so the control keeps the only tab stop.
   *
   * The tooltip is the one `fit-tooltip.svelte` draws for every `Fit`. A `Fit`
   * that is not focusable measures itself only when the pointer reaches it.
   */
  import { FIT_TIP_ID, fitTip, hideFitTip, showFitTip } from "$lib/components/fit/fit-tip.svelte";
  import { cn } from "$lib/utils";
  import { onDestroy } from "svelte";

  let {
    text,
    focusable = true,
    class: className
  }: { text: string; focusable?: boolean; class?: string } = $props();

  let element = $state<HTMLElement | null>(null);
  let cut = $state(false);

  function measure(): boolean {
    if (!element) return false;
    cut = element.scrollWidth > element.clientWidth + 1;
    return cut;
  }

  $effect(() => {
    if (!element || !focusable) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  // A new text of the same box size fires no resize.
  $effect(() => {
    void text;
    if (focusable) measure();
  });

  onDestroy(() => hideFitTip(element));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<span
  bind:this={element}
  tabindex={cut && focusable ? 0 : -1}
  aria-describedby={element !== null && fitTip.anchor === element ? FIT_TIP_ID : undefined}
  onpointerenter={() => {
    if (element && measure()) showFitTip(element, text);
  }}
  onpointerleave={() => hideFitTip(element)}
  onfocus={() => {
    if (element?.matches(":focus-visible") && measure()) showFitTip(element, text, 0);
  }}
  onblur={() => hideFitTip(element)}
  class={cn("min-w-0 truncate", className)}>{text}</span
>
