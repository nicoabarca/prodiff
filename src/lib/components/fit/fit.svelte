<script lang="ts">
  /**
   * Text of unknown length on one line of fixed width. It ends in an ellipsis
   * when it does not fit, and shows the whole text in a tooltip on hover or
   * keyboard focus, only while it is cut. Inside a button or a link,
   * pass `focusable={false}` so the control keeps the only tab stop.
   */
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { cn } from "$lib/utils";

  let {
    text,
    focusable = true,
    class: className
  }: { text: string; focusable?: boolean; class?: string } = $props();

  let element = $state<HTMLElement | null>(null);
  let cut = $state(false);

  function measure() {
    if (!element) return;
    cut = element.scrollWidth > element.clientWidth + 1;
  }

  $effect(() => {
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });

  // A new text of the same box size fires no resize.
  $effect(() => {
    void text;
    measure();
  });
</script>

<Tooltip.Root disabled={!cut} delayDuration={150}>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <span
        {...props}
        bind:this={element}
        tabindex={cut && focusable ? 0 : -1}
        onpointerenter={measure}
        class={cn("min-w-0 truncate", className)}>{text}</span
      >
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="[overflow-wrap:break-word]">{text}</Tooltip.Content>
</Tooltip.Root>
