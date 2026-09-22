export type TuningField =
  | { kind: "choice"; key: string; label: string; options: readonly string[] }
  | {
      kind: "range";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      format?: (value: number) => string;
    }
  | { kind: "toggle"; key: string; label: string };

export type Tier = "compact" | "spaghetti";
