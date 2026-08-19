<script lang="ts">
  /**
   * The format control for one temporal column: a pattern to pick from the
   * catalog or write by hand, plus a warning when the sample could not tell two
   * readings apart.
   */
  import { FORMAT_CATALOG, parseWithFormat, type FormatInference } from "$lib/timestamp-format";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let {
    values,
    inference,
    pattern,
    acknowledged,
    onPatternChange,
    onAcknowledge
  }: {
    /** The column's sample values, in preview order. */
    values: string[];
    /** What inference made of those values when the preview loaded. */
    inference: FormatInference | undefined;
    /** The pattern in force — seeded from inference, overwritten by the user. */
    pattern: string;
    /** Whether the ambiguity warning has been dismissed for this column. */
    acknowledged: boolean;
    onPatternChange: (value: string) => void;
    onAcknowledge: () => void;
  } = $props();

  const CUSTOM = "__custom__";

  // Custom is not stored separately: the record holds whatever pattern is in
  // force, and the select shows Custom whenever that pattern is off-catalog.
  let custom = $state(false);
  const selectValue = $derived(custom || !FORMAT_CATALOG.includes(pattern) ? CUSTOM : pattern);

  const firstValue = $derived(values.find((v) => v.trim() !== "") ?? "");

  const rivals = $derived(inference?.rivals ?? []);
  // The warning is about what the *sample* could not settle, so it stands until
  // acknowledged even after the user picks a pattern by hand — changing the
  // selection does not make the data any less ambiguous.
  const showWarning = $derived(rivals.length > 0 && !acknowledged);

  /** A value the sample could read either way, to name in the warning. */
  const ambiguousValue = $derived(
    values.find((v) => v.trim() !== "" && rivals.every((r) => parseWithFormat(v, r).ok)) ??
      firstValue
  );

  function choose(value: string) {
    if (value === CUSTOM) {
      custom = true;
      return;
    }
    custom = false;
    onPatternChange(value);
  }
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center gap-1.5">
    <Select.Root type="single" value={selectValue} onValueChange={choose}>
      <Select.Trigger size="sm" class="w-full font-mono text-xs">
        {selectValue === CUSTOM ? "Custom" : pattern}
      </Select.Trigger>
      <Select.Content>
        {#each FORMAT_CATALOG as option}
          <Select.Item value={option} label={option} />
        {/each}
        <Select.Item value={CUSTOM} label="Custom" />
      </Select.Content>
    </Select.Root>

    {#if showWarning}
      <HoverCard.Root>
        <HoverCard.Trigger
          class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex shrink-0 rounded-none focus-visible:ring-2 focus-visible:outline-none"
          aria-label="This sample matches more than one format"
        >
          <TriangleAlert class="h-4 w-4" />
        </HoverCard.Trigger>
        <HoverCard.Content class="w-72 space-y-2">
          <p class="text-foreground font-medium">More than one format fits</p>
          <p class="text-muted-foreground">
            <span class="font-mono">{ambiguousValue}</span> reads as
            <span class="font-mono">{pattern}</span> and also as
            <span class="font-mono">{rivals.join(", ")}</span>. Nothing in these rows tells them
            apart, so <span class="font-mono">{pattern}</span> is a guess. Confirm the order is right.
          </p>
          <Button size="sm" class="w-full" onclick={onAcknowledge}>Got it!</Button>
        </HoverCard.Content>
      </HoverCard.Root>
    {/if}
  </div>

  {#if selectValue === CUSTOM}
    <Input
      value={pattern}
      oninput={(e) => onPatternChange(e.currentTarget.value)}
      placeholder="DD/MM/YYYY HH:mm"
      class="h-8 font-mono text-xs"
      aria-label="Custom timestamp format"
    />
  {/if}
</div>
