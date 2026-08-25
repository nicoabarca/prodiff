import type { Project } from "$lib/event-log/types";
import type { EndpointPosition } from "$lib/filters/kind/endpoint";
import { distinctValues } from "$lib/filters/invokers/distinct-values";

/** Distinct values shown in a picker before the scan truncates. */
export const VALUE_LIMIT = 500;

export interface ColumnValues {
  readonly values: string[];
  readonly truncated: boolean;
  readonly error: string | null;
}

/**
 * The values one column holds, kept current as the column changes. Call at the
* top level of a component's script: it owns an `$effect`.
 *
 * Inputs are thunks so the fetch re-runs when they change. An empty `column`
* clears the list without fetching. A reply that lands after the column moved on
* is dropped.
 */
export function columnValues(
  project: () => Project,
  column: () => string,
  endpoint: () => EndpointPosition | null = () => null
): ColumnValues {
  let values = $state<string[]>([]);
  let truncated = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const target = column();
    if (!target) {
      values = [];
      truncated = false;
      error = null;
      return;
    }

    const current = project();
    let stale = false;
    error = null;

    distinctValues(current.id, target, current.columns, VALUE_LIMIT, endpoint())
      .then((result) => {
        if (stale) return;
        values = result.values;
        truncated = result.truncated;
      })
      .catch((cause) => {
        if (!stale) error = String(cause);
      });

    return () => {
      stale = true;
    };
  });

  return {
    get values() {
      return values;
    },
    get truncated() {
      return truncated;
    },
    get error() {
      return error;
    }
  };
}
