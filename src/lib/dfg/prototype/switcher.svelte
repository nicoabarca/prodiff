<!-- PROTOTYPE, throwaway. Floating bar that cycles the DFG layout engine. Dev only. -->
<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { ENGINES, prototype } from "$lib/dfg/prototype/engine.svelte";

  const index = $derived(ENGINES.findIndex((engine) => engine.key === prototype.engine));

  function step(by: number) {
    const engine = ENGINES[(index + by + ENGINES.length) % ENGINES.length].key;
    prototype.engine = engine;
    prototype.ms = null;
    const url = new URL(page.url);
    url.searchParams.set("variant", engine);
    replaceState(url, page.state);
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  }
</script>

<svelte:window {onkeydown} />

<div
  class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-3 py-2 font-mono text-xs text-white shadow-lg"
>
  <button class="rounded-full p-1 hover:bg-white/20" onclick={() => step(-1)} aria-label="Anterior">
    <ChevronLeft class="size-4" />
  </button>
  <span>
    <b>{["A", "B", "C", "D"][index]}</b> · {ENGINES[index].name}
    · {prototype.ms === null ? "…" : `${prototype.ms} ms${prototype.cached ? " (cache)" : ""}`}
    · {prototype.nodes} nodos / {prototype.edges} edges
    · labels {prototype.labelsInLayout ? "en el layout" : "fuera del layout"}
  </span>
  <button class="rounded-full p-1 hover:bg-white/20" onclick={() => step(1)} aria-label="Siguiente">
    <ChevronRight class="size-4" />
  </button>
</div>
