<script lang="ts" module>
  /** The three parts of a two-Group Venn: only the left Group, both, only the right. */
  export type VennRegion = "left" | "shared" | "right";

  /** How much of a region is selected: all of it, none of it, or some. */
  export type VennState = "on" | "off" | "mixed";
</script>

<script lang="ts">
  /**
   * Two overlapping circles, one per Group, whose three regions toggle
   * independently: any union of them can be selected. Each region shows its
   * count and fills with its Group's colour while selected.
   */
  let {
    left,
    right,
    regions,
    onToggle
  }: {
    left: { label: string; color: string };
    right: { label: string; color: string };
    regions: Record<VennRegion, { count: number; state: VennState }>;
    onToggle: (region: VennRegion) => void;
  } = $props();

  /** Geometry in viewBox units: two circles of radius `R`, `GAP` apart. */
  const R = 24;
  const GAP = 30;
  const CY = 28;
  const LX = 50;
  const RX = LX + GAP;
  const MX = (LX + RX) / 2;
  const HALF = Math.sqrt(R * R - (GAP / 2) * (GAP / 2));
  const TOP = `${MX} ${CY - HALF}`;
  const BOTTOM = `${MX} ${CY + HALF}`;

  // Arc flags: large-arc then sweep, where sweep 1 runs clockwise on screen.
  const paths: Record<VennRegion, string> = {
    left: `M ${TOP} A ${R} ${R} 0 1 0 ${BOTTOM} A ${R} ${R} 0 0 1 ${TOP} Z`,
    shared: `M ${TOP} A ${R} ${R} 0 0 1 ${BOTTOM} A ${R} ${R} 0 0 1 ${TOP} Z`,
    right: `M ${TOP} A ${R} ${R} 0 1 1 ${BOTTOM} A ${R} ${R} 0 0 0 ${TOP} Z`
  };

  const centers: Record<VennRegion, number> = {
    left: LX - R / 2.4,
    shared: MX,
    right: RX + R / 2.4
  };

  const inks = $derived<Record<VennRegion, string>>({
    left: left.color,
    shared: `color-mix(in oklab, ${left.color} 50%, ${right.color})`,
    right: right.color
  });

  const names = $derived<Record<VennRegion, string>>({
    left: `Only ${left.label}`,
    shared: "Shared",
    right: `Only ${right.label}`
  });

  const OPACITY: Record<VennState, number> = { on: 0.45, mixed: 0.18, off: 0 };

  const order: VennRegion[] = ["left", "shared", "right"];

  function onKey(event: KeyboardEvent, region: VennRegion) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle(region);
  }
</script>

<svg viewBox="0 0 {LX + RX} {CY * 2 + 16}" class="h-[4.5rem] w-auto shrink-0 select-none" role="group">
  {#each order as region (region)}
    {@const { count, state } = regions[region]}
    <path
      d={paths[region]}
      role="checkbox"
      tabindex="0"
      aria-checked={state === "mixed" ? "mixed" : state === "on"}
      aria-label="{names[region]}: {count} variants"
      class="focus-visible:stroke-ring cursor-pointer stroke-transparent stroke-2 outline-none hover:opacity-80"
      style="fill:{inks[region]};fill-opacity:{OPACITY[state]}"
      onclick={() => onToggle(region)}
      onkeydown={(event) => onKey(event, region)}
    >
      <title>{names[region]}</title>
    </path>
    <text
      x={centers[region]}
      y={CY}
      text-anchor="middle"
      dominant-baseline="central"
      class="pointer-events-none fill-current font-mono text-[0.625rem] tabular-nums {state ===
      'off'
        ? 'text-muted-foreground'
        : 'text-foreground font-semibold'}"
    >
      {count}
    </text>
  {/each}

  <circle cx={LX} cy={CY} r={R} class="pointer-events-none fill-none" style="stroke:{left.color}" />
  <circle
    cx={RX}
    cy={CY}
    r={R}
    class="pointer-events-none fill-none"
    style="stroke:{right.color}"
  />

  <text
    x={LX - R / 2.4}
    y={CY * 2 + 10}
    text-anchor="middle"
    class="pointer-events-none text-[0.5625rem] font-semibold"
    style="fill:{left.color}"
  >
    {left.label.length > 14 ? `${left.label.slice(0, 13)}…` : left.label}
  </text>
  <text
    x={RX + R / 2.4}
    y={CY * 2 + 10}
    text-anchor="middle"
    class="pointer-events-none text-[0.5625rem] font-semibold"
    style="fill:{right.color}"
  >
    {right.label.length > 14 ? `${right.label.slice(0, 13)}…` : right.label}
  </text>
</svg>
