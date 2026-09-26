/** The views a Tour exists for. */
export type TourId = "filters";

/**
 * One element a step points at: the element carrying `data-tour={anchor}`, and
 * `data-tour-key={key}` too when there are several of it.
 */
export interface Target {
  anchor: string;
  key?: string;
}

/**
 * One step of a Tour. `target` is a path, outermost first, and a step without
 * one is a centred popover. A step with `until` is an action step: it waits for
 * the user to act, and moves on by itself once `until` holds. The user can click
 * through the highlight on an action step and on an `interactive` one.
 */
export interface TourStep {
  target?: Target[];
  title: string;
  body: string;
  side?: "top" | "right" | "bottom" | "left";
  until?: () => boolean;
  interactive?: boolean;
}
