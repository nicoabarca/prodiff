/**
 * PROTOTYPE, throwaway. Which layout engine the DFG canvas runs, picked by the
 * `?variant=` search param and the floating switcher, and how long the last
 * layout took. Dev only.
 */
export type Engine = "elk" | "elk-fast" | "dot" | "elk-layered";

export const ENGINES: { key: Engine; name: string }[] = [
  { key: "elk", name: "ELK actual" },
  { key: "elk-fast", name: "ELK mejorado" },
  { key: "dot", name: "Graphviz dot (Celonis)" },
  { key: "elk-layered", name: "ELK con pesos en las capas" }
];

const fromUrl = (): Engine => {
  const wanted = new URL(location.href).searchParams.get("variant");
  return ENGINES.some((engine) => engine.key === wanted) ? (wanted as Engine) : "elk";
};

/**
 * Timestamps (performance.now) of the last DFG build, from the call to `load`
 * to the frame after the canvas drew its placement.
 */
export const run = $state<{
  start: number | null;
  variants: number | null;
  rust: number | null;
  layoutStart: number | null;
  layoutDone: number | null;
  painted: number | null;
}>({ start: null, variants: null, rust: null, layoutStart: null, layoutDone: null, painted: null });

export function startRun() {
  Object.assign(run, {
    start: performance.now(),
    variants: null,
    rust: null,
    layoutStart: null,
    layoutDone: null,
    painted: null
  });
}

export const prototype = $state<{
  engine: Engine;
  ms: number | null;
  cached: boolean;
  nodes: number;
  edges: number;
  labelsInLayout: boolean;
}>({
  engine: fromUrl(),
  ms: null,
  cached: false,
  nodes: 0,
  edges: 0,
  labelsInLayout: false
});
