export const ATTRIBUTE_MODES = ["mandatory", "forbidden", "keep_selected"] as const;
export type AttributeMode = (typeof ATTRIBUTE_MODES)[number];

export interface AttributeFilter {
  kind: "attribute";
  column: string;
  mode: AttributeMode;
  values: string[];
}

/** The explanatory text shown beside each mode in the filter editor. */
export const ATTRIBUTE_MODE_INFO: Record<AttributeMode, { label: string; description: string }> = {
  mandatory: {
    label: "Mandatory",
    description:
      "Removes cases that do not contain at least one event with a selected value. Retained cases are kept whole."
  },
  forbidden: {
    label: "Forbidden",
    description:
      "Removes cases that contain at least one event with a selected value. Non-matching cases are retained whole."
  },
  keep_selected: {
    label: "Keep selected",
    description:
      "Removes individual events that do not carry a selected value. Surviving cases keep only matching events, so their variant becomes a sub-sequence of the original."
  }
};

export function describeAttribute(filter: AttributeFilter): { title: string; detail: string } {
  return {
    title: `${filter.column} — ${ATTRIBUTE_MODE_INFO[filter.mode].label.toLowerCase()}`,
    detail: filter.values.join(", ") || "no values selected"
  };
}

export function isAttributeComplete(filter: AttributeFilter): boolean {
  return filter.values.length > 0;
}
