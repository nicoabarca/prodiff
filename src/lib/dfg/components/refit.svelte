<script lang="ts">
  /**
   * Fits the flow it sits in whenever `at` moves on. Lives inside `SvelteFlow`
   * because that is the only place the instance can be reached from.
   */
  import { tick } from "svelte";
  import { useSvelteFlow, type FitViewOptions } from "@xyflow/svelte";

  let { at, options }: { at: number; options: FitViewOptions } = $props();

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
    // The nodes are seeded in a sibling effect, so the fit waits for the DOM
    // they produce before measuring anything.
    void tick().then(() => flow.fitView(options));
  });
</script>
