<!-- PROTOTYPE, throwaway. Floating bar that cycles the DFG layout engine. Dev only. -->
<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import { ENGINES, prototype, run } from "$lib/dfg/prototype/engine.svelte";
  import { clearAllLayoutCaches } from "$lib/dfg/prototype/layout";
  import { built, load } from "$lib/dfg/state/dfg.svelte";
  import { currentProject } from "$lib/event-log/state/projects.svelte";

  const span = (from: number | null, to: number | null) =>
    from === null || to === null ? "…" : `${Math.round(to - from)} ms`;

  function rebuild() {
    const project = currentProject();
    if (!project) return;
    clearAllLayoutCaches();
    load(project, true);
  }

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
  class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl bg-black px-3 py-2 font-mono text-xs text-white shadow-lg"
>
<div class="flex items-center gap-3">
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
<div class="flex items-center gap-3 text-white/80">
  <button
    class="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/30 disabled:opacity-50"
    disabled={built.building}
    onclick={rebuild}
  >
    <RefreshCw class="size-3" /> Rebuild
  </button>
  <span>
    variants {span(run.start, run.variants)}
    · Rust {span(run.variants, run.rust)}
    · frontend {span(run.rust, run.layoutStart)}
    · layout {span(run.layoutStart, run.layoutDone)}
    · render {span(run.layoutDone, run.painted)}
    · <b>total {span(run.start, run.painted)}</b>
  </span>
</div>
</div>
