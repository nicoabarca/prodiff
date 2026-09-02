<script lang="ts">
  import { BaseEdge, type EdgeProps } from "@xyflow/svelte";
  import type { DfgEdgeData } from "$lib/dfg/types";

  let { data, sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps = $props();

  const edge = $derived(data as DfgEdgeData);
  // ELK routes the whole edge around the boxes. The straight line between the
  // two handles is only the fallback for one it declined to route.
  const path = $derived(edge.path || `M${sourceX},${sourceY} L${targetX},${targetY}`);
</script>

<BaseEdge
  {path}
  {markerEnd}
  label={edge.label ?? undefined}
  labelX={(sourceX + targetX) / 2}
  labelY={(sourceY + targetY) / 2}
  labelStyle="font-size:0.625rem;font-family:ui-monospace,monospace;fill:var(--muted-foreground)"
  style="stroke-width:{edge.width.toFixed(2)};stroke:var(--muted-foreground)"
  class={edge.boundary ? "opacity-60 [stroke-dasharray:4_4]" : undefined}
/>
