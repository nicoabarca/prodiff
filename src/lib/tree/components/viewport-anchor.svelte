<script module lang="ts">
  import type { Point } from "$lib/tree/utils/layout";

  export interface ViewportAnchorState {
    token: number;
    refit: boolean;
    before: Map<string, Point>;
    after: Map<string, Point>;
  }
</script>

<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";

  let {
    anchor,
    pane
  }: {
    anchor: ViewportAnchorState;
    pane: HTMLElement | null;
  } = $props();

  const { getViewport, setViewport, fitView } = useSvelteFlow();

  let seen = 0;
  $effect(() => {
    const current = anchor;
    if (current.token === seen) return;
    seen = current.token;
    if (current.token === 0) return;

    if (current.refit) {
      fitView({ duration: 300 });
      return;
    }

    const viewport = getViewport();
    const width = pane?.clientWidth ?? 0;
    const height = pane?.clientHeight ?? 0;
    if (width === 0 || height === 0) return;

    const left = -viewport.x / viewport.zoom;
    const top = -viewport.y / viewport.zoom;
    const right = left + width / viewport.zoom;
    const bottom = top + height / viewport.zoom;

    let sumBefore = { x: 0, y: 0 };
    let sumAfter = { x: 0, y: 0 };
    let counted = 0;
    for (const [key, was] of current.before) {
      const now = current.after.get(key);
      if (!now) continue;
      if (was.x < left || was.x > right || was.y < top || was.y > bottom) continue;
      sumBefore = { x: sumBefore.x + was.x, y: sumBefore.y + was.y };
      sumAfter = { x: sumAfter.x + now.x, y: sumAfter.y + now.y };
      counted += 1;
    }
    if (counted === 0) return;

    const dx = sumAfter.x / counted - sumBefore.x / counted;
    const dy = sumAfter.y / counted - sumBefore.y / counted;
    if (dx === 0 && dy === 0) return;
    setViewport(
      {
        x: viewport.x - dx * viewport.zoom,
        y: viewport.y - dy * viewport.zoom,
        zoom: viewport.zoom
      },
      { duration: 300 }
    );
  });
</script>
