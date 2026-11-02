/** PROTOTYPE, throwaway. Runs Graphviz dot off the main thread. */
import { Graphviz } from "@hpcc-js/wasm-graphviz";

const ready = Graphviz.load();

self.onmessage = async (event: MessageEvent<{ id: number; dot: string }>) => {
  const graphviz = await ready;
  const { id, dot } = event.data;
  try {
    self.postMessage({ id, json: graphviz.layout(dot, "json", "dot") });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
