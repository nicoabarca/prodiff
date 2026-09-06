<script lang="ts">
  /**
   * The format control for one temporal column: how much of the file the
   * pattern in force reads, and a dialog to change it against a live preview of
   * the sample.
   */
  import { Dialog as DialogPrimitive } from "bits-ui";
  import {
    FORMAT_CATALOG,
    parseWithFormat,
    tokenize,
    type FormatInference
  } from "$lib/event-log/utils/timestamp-format";
  import type { FormatCheck } from "$lib/event-log/types";
  import { matchedRows } from "$lib/event-log/utils/format-check";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Settings from "@lucide/svelte/icons/settings";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  let {
    column,
    values,
    inference,
    pattern,
    check,
    checking = false,
    onPatternChange
  }: {
    column: string;
    /** The column's sample values, in preview order. */
    values: string[];
    /** What inference made of those values when the preview loaded. */
    inference: FormatInference | undefined;
    /** The pattern in force — seeded from inference, overwritten by the user. */
    pattern: string;
    /** What the full-file pass made of that pattern, absent until it lands. */
    check: FormatCheck | undefined;
    /** Whether the file is being read to count this pattern's matches. */
    checking?: boolean;
    onPatternChange: (value: string) => void;
  } = $props();

  const CUSTOM = "__custom__";

  // Each token the pattern vocabulary understands, spelled out for the dialog.
  const LEGEND: [string, string][] = [
    ["YYYY", "Four digit year"],
    ["YY", "Two digit year"],
    ["MM", "Month in year"],
    ["DD", "Day in month"],
    ["HH", "Hour, 0 to 23"],
    ["hh", "Hour, 1 to 12"],
    ["mm", "Minute in hour"],
    ["ss", "Second in minute"],
    ["SSS", "Milliseconds"],
    ["SSSSSS", "Microseconds"],
    ["A", "AM or PM"],
    ["Z", "Time zone offset, Z or +00:00"]
  ];

  // Milliseconds. Re-reading the sample against a half-typed pattern paints the
  // whole preview red, so it waits for the typing to settle. Picking a preset,
  // leaving the box or pressing Enter is the user saying they are done, and
  // skips the wait.
  const PREVIEW_DEBOUNCE = 500;

  let open = $state(false);
  let draft = $state("");
  // The pattern the preview below is showing. It trails `draft` while typing.
  let previewPattern = $state("");
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(previewTimer));

  const draftIsCatalog = $derived(FORMAT_CATALOG.includes(draft));

  // Letters outside a token are matched as text, which is almost never what the
  // writer meant: `+SS:SS` looks like a field and reads as the literal "SS".
  const strayLetters = $derived.by(() => {
    const stray = new Set<string>();
    for (const piece of tokenize(draft)) {
      if (piece.kind !== "literal") continue;
      for (const run of piece.text.match(/[A-Za-z]+/g) ?? []) stray.add(run);
    }
    return [...stray];
  });
  const settling = $derived(draft !== previewPattern);

  /** The sample rows the preview reads, missing cells left out. */
  const sample = $derived(values.filter((v) => v.trim() !== ""));
  const preview = $derived(
    sample.map((value) => {
      const result = parseWithFormat(value, previewPattern);
      return { value, iso: result.ok ? result.iso : null };
    })
  );
  const matchedInSample = $derived(preview.filter((row) => row.iso !== null).length);
  const sampleShare = $derived(
    sample.length === 0 ? 0 : Math.round((matchedInSample / sample.length) * 100)
  );

  const fileShare = $derived.by(() => {
    if (!check || check.rows === 0) return null;
    return Math.round((matchedRows(check) / check.rows) * 100);
  });

  // What the pattern in force reads in the previewed rows. It stands in for the
  // full-file count until that lands, so a seeded pattern says how well it fits
  // straight away instead of reading as unchecked.
  const inForceShare = $derived.by(() => {
    if (pattern === "" || sample.length === 0) return null;
    const read = sample.filter((value) => parseWithFormat(value, pattern).ok).length;
    return Math.round((read / sample.length) * 100);
  });

  function typePattern(value: string) {
    draft = value;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => (previewPattern = value), PREVIEW_DEBOUNCE);
  }

  function showDraftNow() {
    clearTimeout(previewTimer);
    previewPattern = draft;
  }

  function choosePreset(value: string) {
    if (value === CUSTOM) return;
    draft = value;
    showDraftNow();
  }

  function openDialog() {
    clearTimeout(previewTimer);
    draft = pattern;
    previewPattern = pattern;
    open = true;
  }

  function apply() {
    onPatternChange(draft);
    open = false;
  }
</script>

<div class="flex shrink-0 items-center justify-end gap-1.5">
  {#if checking}
    <LoaderCircle
      class="text-muted-foreground h-4 w-4 shrink-0 animate-spin"
      aria-label="Counting the rows this format reads"
    />
  {:else if fileShare !== null}
    <span class="text-muted-foreground text-xs whitespace-nowrap">matches {fileShare}% of rows</span>
  {:else if inForceShare !== null}
    <span class="text-muted-foreground text-xs whitespace-nowrap">matches {inForceShare}% of sample</span>
  {:else}
    <span class="text-muted-foreground text-xs whitespace-nowrap">No format found</span>
  {/if}
  <Button
    variant="ghost"
    size="icon-sm"
    onclick={openDialog}
    aria-label="Set the timestamp pattern for {column}"
  >
    <Settings />
  </Button>
</div>

<DialogPrimitive.Root bind:open>
  <DialogPrimitive.Portal>
    <!--
      The overlay dims without a backdrop filter: the table behind the dialog is
      what the user is checking the pattern against.
    -->
    <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/20" />
    <DialogPrimitive.Content
      class="bg-popover text-popover-foreground ring-foreground/10 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-none p-5 ring-1 outline-none sm:max-w-2xl"
    >
      <div class="flex flex-col gap-1">
        <DialogPrimitive.Title class="font-heading text-base font-bold tracking-tight">
          Set timestamp pattern
        </DialogPrimitive.Title>
        <DialogPrimitive.Description class="text-muted-foreground text-xs">
          The pattern reads the timestamps out of
          <span class="font-mono">{column}</span>. Write it below or pick a preset, and see how it
          fits the values in the sample.
        </DialogPrimitive.Description>
      </div>

      <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div class="flex w-full min-w-0 flex-col gap-3 sm:max-w-xs">
          <label class="flex flex-col gap-1.5">
            <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
              >Pattern</span
            >
            <Input
              value={draft}
              oninput={(e) => typePattern(e.currentTarget.value)}
              onblur={showDraftNow}
              onkeydown={(e) => e.key === "Enter" && showDraftNow()}
              placeholder="DD/MM/YYYY HH:mm"
              class="h-8 font-mono text-xs"
            />
          </label>
          <div class="flex flex-col gap-1.5">
            <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
              >Presets</span
            >
            <Select.Root
              type="single"
              value={draftIsCatalog ? draft : CUSTOM}
              onValueChange={choosePreset}
            >
              <Select.Trigger size="sm" class="w-full min-w-0 font-mono text-xs">
                <span class="min-w-0 flex-1 truncate text-left">
                  {draftIsCatalog ? draft : "Custom"}
                </span>
              </Select.Trigger>
              <Select.Content class="max-h-[11.5rem] overflow-y-auto">
                {#each FORMAT_CATALOG as option}
                  <Select.Item value={option} label={option} />
                {/each}
                <Select.Item value={CUSTOM} label="Custom" />
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
            >Pattern legend</span
          >
          <table class="border-border w-full border text-[0.6875rem]">
            <tbody>
              {#each LEGEND as [token, meaning]}
                <tr class="border-border/60 border-b last:border-b-0">
                  <th
                    scope="row"
                    class="border-border/60 text-foreground w-20 border-r px-2 py-0.5 text-left font-mono font-normal"
                  >
                    {token}
                  </th>
                  <td class="text-muted-foreground px-2 py-0.5">{meaning}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if strayLetters.length > 0}
        <p class="text-destructive text-xs">
          <span class="font-mono">{strayLetters.join(", ")}</span>
          {strayLetters.length === 1 ? "is not a pattern token, so it is" : "are not pattern tokens, so they are"}
          matched as text. A trailing offset like <span class="font-mono">+00:00</span> is
          <span class="font-mono">Z</span>.
        </p>
      {/if}

      {#if inference && inference.rivals.length > 0}
        <p class="text-muted-foreground text-xs">
          The sample also reads as <span class="font-mono">{inference.rivals.join(", ")}</span>.
          Nothing in these rows tells them apart, so confirm the order is right.
        </p>
      {/if}

      <div class="flex min-h-0 flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
            >Matching preview</span
          >
          {#if settling}
            <span class="text-muted-foreground flex items-center gap-1.5 text-xs">
              <LoaderCircle class="h-3 w-3 animate-spin" aria-hidden="true" />
              Reading <span class="font-mono">{draft}</span>
            </span>
          {/if}
        </div>
        <div
          class={`border-border max-h-64 min-h-0 flex-1 overflow-y-auto border transition-opacity ${
            settling ? "opacity-50" : ""
          }`}
        >
          {#each preview as row}
            <div class="border-border/60 grid grid-cols-2 border-b last:border-b-0">
              <span class="text-muted-foreground truncate px-2 py-1 font-mono text-xs"
                >{row.value}</span
              >
              <span
                class={`truncate px-2 py-1 font-mono text-xs ${
                  row.iso
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {row.iso ?? "no match"}
              </span>
            </div>
          {/each}
        </div>
        <p class={`text-right text-xs ${settling ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
          <span class="font-mono">{previewPattern || "—"}</span> matches {sampleShare}% of the
          {sample.length.toLocaleString()} sample rows
        </p>
      </div>

      <div class="flex items-center justify-end gap-3">
        <DialogPrimitive.Close>
          {#snippet child({ props })}
            <Button {...props} variant="outline">Cancel</Button>
          {/snippet}
        </DialogPrimitive.Close>
        <Button onclick={apply} disabled={draft.trim() === ""}>Use pattern</Button>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
