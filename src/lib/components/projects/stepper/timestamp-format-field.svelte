<script lang="ts">
  /**
   * The format control for one temporal column: a pattern to pick, the evidence
   * of what that pattern makes of the real data, and — when the sample could not
   * tell two readings apart — a warning the user has to acknowledge.
   *
   * It lives in the mapping steps rather than behind a dialog because this is
   * where "how, when and where do I verify the format?" gets answered, and an
   * answer nobody opens is not an answer.
   */
  import {
    coverage,
    FORMAT_CATALOG,
    parseWithFormat,
    type FormatInference
  } from "$lib/timestamp-format";
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
    onAcknowledge,
    compact = false
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
    /** Narrower layout for the field-settings table. */
    compact?: boolean;
  } = $props();

  const CUSTOM = "__custom__";

  // Custom is not stored separately: the record holds whatever pattern is in
  // force, and the select shows Custom whenever that pattern is off-catalog.
  let custom = $state(false);
  const selectValue = $derived(custom || !FORMAT_CATALOG.includes(pattern) ? CUSTOM : pattern);

  const stats = $derived(
    pattern ? coverage(values, pattern) : { matched: 0, total: 0, firstFailure: null }
  );
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
      <Select.Trigger
        size="sm"
        class={compact ? "w-44 font-mono text-xs" : "w-full font-mono text-xs"}
      >
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

  <!--
    Nothing is said when the pattern reads the whole sample: the select already
    names the format, and restating that it works adds a line to every card to
    report the ordinary case. Only what the user has to act on gets words.
  -->
  {#if !pattern}
    <p class="text-muted-foreground text-xs">
      No format inferred. Pick one, or write it under Custom.
    </p>
  {:else if stats.total === 0}
    <p class="text-muted-foreground text-xs">No values in the sample to check this against.</p>
  {:else if stats.firstFailure}
    <p class="text-destructive text-xs">
      {stats.matched}/{stats.total} sample values parse.
      <span class="font-mono">{stats.firstFailure.value}</span> at row {stats.firstFailure.row + 1} does
      not match.
    </p>
  {/if}
</div>
