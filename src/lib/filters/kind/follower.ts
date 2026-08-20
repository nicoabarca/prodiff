export const FOLLOWER_MODES = [
  "eventually",
  "directly",
  "never_eventually",
  "never_directly"
] as const;
export type FollowerMode = (typeof FOLLOWER_MODES)[number];

/**
 * One column read twice: a case matches when some event holding a `reference`
 * value is followed by some event holding a `follower` one.
 */
export interface FollowerFilter {
  kind: "follower";
  column: string;
  mode: FollowerMode;
  reference: string[];
  follower: string[];
}

export const FOLLOWER_MODE_INFO: Record<FollowerMode, { label: string; description: string }> = {
  eventually: {
    label: "Eventually followed",
    description:
      "Keeps cases where a reference event is followed, anywhere later in the case, by a follower event."
  },
  directly: {
    label: "Directly followed",
    description:
      "Keeps cases where a follower event is the very next event after a reference event."
  },
  never_eventually: {
    label: "Never eventually followed",
    description:
      "Keeps every other case — including cases that never hold a reference value at all."
  },
  never_directly: {
    label: "Never directly followed",
    description:
      "Keeps cases where no reference event is immediately followed by a follower event. A follower further along is allowed."
  }
};

export function describeFollower(filter: FollowerFilter): { title: string; detail: string } {
  return {
    title: `${filter.column} — ${FOLLOWER_MODE_INFO[filter.mode].label.toLowerCase()}`,
    detail: `${filter.reference.join(", ") || "nothing"} → ${filter.follower.join(", ") || "nothing"}`
  };
}

export function isFollowerComplete(filter: FollowerFilter): boolean {
  return filter.reference.length > 0 && filter.follower.length > 0;
}
