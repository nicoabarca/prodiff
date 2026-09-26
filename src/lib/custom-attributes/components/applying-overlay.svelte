<script lang="ts">
  import { applying } from "$lib/custom-attributes/state/applying.svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
</script>

<!-- Covers the whole project while its files are rewritten: no view may read them halfway. -->
{#if applying.message}
  <div
    class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-busy="true"
    aria-label="Recalculating custom attributes"
  >
    <div
      class="border-border bg-card flex max-w-md flex-col items-center gap-3 border p-6 text-center"
    >
      <LoaderCircle class="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
      <p class="text-sm font-medium">{applying.message}</p>
      <p class="text-muted-foreground text-xs">
        The event log and its groups are being rewritten. Keep the app open until this finishes.
      </p>
    </div>
  </div>
{/if}
