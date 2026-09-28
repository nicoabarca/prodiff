<script lang="ts">
  import { cn } from "$lib/utils";

  let { class: className }: { class?: string } = $props();
</script>

<!-- The app icon's mark: an outlined square overlapped by a filled one. -->
<svg viewBox="0 0 24 24" class={cn("size-7 shrink-0", className)} aria-hidden="true">
  <rect
    x="2.5"
    y="2.5"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
  />
  <rect x="9" y="9" width="13" height="13" class="fill-primary" />
</svg>
