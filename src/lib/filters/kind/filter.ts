/**
 * The filter union and the dispatch over it, shared with
 * `src-tauri/src/filters/mod.rs` — any change here needs the matching serde
 * enum changed too.
 *
 * Each kind lives in its own module beside this one and owns its modes, its
 * copy, and its arms of the two functions below, mirroring `mod.rs`.
 */
import {
  describeCaseNotInGroup,
  isCaseNotInGroupComplete,
  type CaseNotInGroupFilter
} from "$lib/filters/kind/case-not-in-group";
import {
  describeAttribute,
  isAttributeComplete,
  type AttributeFilter
} from "$lib/filters/kind/attribute";
import {
  describeDuration,
  isDurationComplete,
  type DurationFilter
} from "$lib/filters/kind/duration";
import {
  describeEndpoint,
  isEndpointComplete,
  type EndpointFilter
} from "$lib/filters/kind/endpoint";
import {
  describeFollower,
  isFollowerComplete,
  type FollowerFilter
} from "$lib/filters/kind/follower";
import { describeNumeric, isNumericComplete, type NumericFilter } from "$lib/filters/kind/numeric";
import {
  describeTimeframe,
  isTimeframeComplete,
  type TimeframeFilter
} from "$lib/filters/kind/timeframe";

export type Filter =
  | AttributeFilter
  | NumericFilter
  | TimeframeFilter
  | EndpointFilter
  | DurationFilter
  | FollowerFilter
  | CaseNotInGroupFilter;
export type FilterKind = Filter["kind"];

/** The column a filter reads, or `null` for filters not tied to one. */
export function filterColumn(filter: Filter): string | null {
  return filter.kind === "attribute" || filter.kind === "numeric" || filter.kind === "follower"
    ? filter.column
    : null;
}

/** Title/detail pair for a filter chip. */
export function describeFilter(filter: Filter): { title: string; detail: string } {
  switch (filter.kind) {
    case "attribute":
      return describeAttribute(filter);
    case "numeric":
      return describeNumeric(filter);
    case "timeframe":
      return describeTimeframe(filter);
    case "endpoint":
      return describeEndpoint(filter);
    case "duration":
      return describeDuration(filter);
    case "follower":
      return describeFollower(filter);
    case "case_not_in_group":
      return describeCaseNotInGroup(filter);
  }
}

/**
 * A filter with no selection yet has no effect on the log but would read as one
 * in the UI, so the editor refuses to save it.
 */
export function isFilterComplete(filter: Filter): boolean {
  switch (filter.kind) {
    case "attribute":
      return isAttributeComplete(filter);
    case "numeric":
      return isNumericComplete(filter);
    case "timeframe":
      return isTimeframeComplete(filter);
    case "endpoint":
      return isEndpointComplete(filter);
    case "duration":
      return isDurationComplete(filter);
    case "follower":
      return isFollowerComplete(filter);
    case "case_not_in_group":
      return isCaseNotInGroupComplete(filter);
  }
}
