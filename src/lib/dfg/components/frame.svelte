<script lang="ts">
  /**
   * Fits the flow it sits in onto `ids` whenever `at` moves on. Lives inside
   * `SvelteFlow` because that is the only place the instance can be reached from.
   */
  import { useSvelteFlow, type FitViewOptions } from "@xyflow/svelte";

  let { ids, at, options }: { ids: number[]; at: number; options: FitViewOptions } = $props();

  const flow = useSvelteFlow();

  let done: number | null = null;
  $effect(() => {
    const wanted = at;
    if (done === null) {
      done = wanted;
      return;
    }
    if (wanted === done) return;
    done = wanted;
    void flow.fitView({
      ...options,
      nodes: ids.map((id) => ({ id: String(id) })),
      maxZoom: 1.25,
      duration: 400
    });
  });
</script>
