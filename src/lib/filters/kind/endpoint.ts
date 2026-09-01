export const ENDPOINT_MODES = ["mandatory", "forbidden"] as const;
export type EndpointMode = (typeof ENDPOINT_MODES)[number];

export const ENDPOINT_POSITIONS = ["start", "end"] as const;
export type EndpointPosition = (typeof ENDPOINT_POSITIONS)[number];

export interface EndpointFilter {
  kind: "endpoint";
  position: EndpointPosition;
  mode: EndpointMode;
  activities: string[];
}

export const ENDPOINT_MODE_INFO: Record<EndpointMode, { label: string; description: string }> = {
  mandatory: { label: "Mandatory", description: "Keeps only cases with a selected endpoint." },
  forbidden: { label: "Forbidden", description: "Removes cases with a selected endpoint." }
};

export function describeEndpoint(filter: EndpointFilter): { title: string; detail: string } {
  return {
    title: filter.position === "start" ? "Starts with" : "Ends with",
    detail:
      (filter.activities.join(", ") || "no activities selected") +
      (filter.mode === "forbidden" ? " (excluded)" : "")
  };
}

export function isEndpointComplete(filter: EndpointFilter): boolean {
  return filter.activities.length > 0;
}
