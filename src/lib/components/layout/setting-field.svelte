<script lang="ts">
  /**
   * One segment of a view's toolbar: a caption naming the setting over its
   * current value. Extra attributes reach the button, so it can serve as a
   * Popover or Dialog trigger.
   */
  import type { Component, Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let {
    icon: Icon,
    caption,
    open = false,
    class: className,
    children,
    ...rest
  }: HTMLButtonAttributes & {
    icon: Component;
    caption: string;
    open?: boolean;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  class={cn(
    "border-border hover:bg-accent aria-expanded:bg-accent flex min-w-0 cursor-pointer flex-col justify-center gap-0.75 border-r px-3.5 py-1.75 text-left",
    open && "bg-accent",
    className
  )}
  {...rest}
>
  <span
    class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[0.625rem] font-semibold tracking-wide"
  >
    <Icon class="size-3 shrink-0" aria-hidden="true" />
    <span class="truncate">{caption}</span>
  </span>
  <span
    class="flex min-w-0 items-center gap-1.5 text-xs font-semibold whitespace-nowrap tabular-nums"
  >
    {@render children()}
    <ChevronDown
      class={cn(
        "text-muted-foreground size-3.5 shrink-0 transition-transform",
        open && "rotate-180"
      )}
      aria-hidden="true"
    />
  </span>
</button>
