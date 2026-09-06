<script lang="ts">
  import {
    FORMAT_CATALOG,
    tokenize,
    type FormatInference
  } from "$lib/event-log/utils/timestamp-format";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import TimestampPatternPreview from "./timestamp-pattern-preview.svelte";
  import TimestampTokenLegend from "./timestamp-token-legend.svelte";

  let {
    column,
    values,
    inference,
    pattern,
    open = $bindable(),
    onApply
  }: {
    column: string;
    values: string[];
    inference: FormatInference | undefined;
    pattern: string;
    open: boolean;
    onApply: (value: string) => void;
  } = $props();

  const CUSTOM = "__custom__";
  const PREVIEW_DEBOUNCE = 500;
  let draft = $state("");
  let previewPattern = $state("");
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let wasOpen = false;

  $effect(() => {
    if (open && !wasOpen) {
      clearTimeout(previewTimer);
      draft = pattern;
      previewPattern = pattern;
    }
    wasOpen = open;
  });
  $effect(() => () => clearTimeout(previewTimer));

  const draftIsCatalog = $derived(FORMAT_CATALOG.includes(draft));
  const strayLetters = $derived.by(() => {
    const stray = new Set<string>();
    for (const piece of tokenize(draft)) {
      if (piece.kind !== "literal") continue;
      for (const run of piece.text.match(/[A-Za-z]+/g) ?? []) stray.add(run);
    }
    return [...stray];
  });
  const settling = $derived(draft !== previewPattern);
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

  function apply() {
    onApply(draft);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex max-h-[calc(100vh-4rem)] flex-col gap-4 sm:max-w-2xl"
  >
    <Dialog.Header>
      <Dialog.Title>Set timestamp pattern</Dialog.Title>
      <Dialog.Description>
        Set the pattern for <span class="font-mono">{column}</span> and verify it against the sample.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
      <Field.FieldGroup class="w-full sm:max-w-xs">
        <Field.Field>
          <Field.FieldLabel for="timestamp-pattern">Pattern</Field.FieldLabel>
          <Input
            id="timestamp-pattern"
            value={draft}
            oninput={(event) => typePattern(event.currentTarget.value)}
            onblur={showDraftNow}
            onkeydown={(event) => event.key === "Enter" && showDraftNow()}
            placeholder="DD/MM/YYYY HH:mm"
            class="font-mono"
          />
        </Field.Field>
        <Field.Field>
          <Field.FieldLabel>Preset</Field.FieldLabel>
          <Select.Root
            type="single"
            value={draftIsCatalog ? draft : CUSTOM}
            onValueChange={choosePreset}
          >
            <Select.Trigger size="sm" class="w-full min-w-0 font-mono">
              <span class="min-w-0 flex-1 truncate text-left">
                {draftIsCatalog ? draft : "Custom"}
              </span>
            </Select.Trigger>
            <Select.Content class="max-h-[11.5rem] overflow-y-auto">
              <Select.Group>
                {#each FORMAT_CATALOG as option}
                  <Select.Item value={option} label={option} />
                {/each}
                <Select.Item value={CUSTOM} label="Custom" />
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
      </Field.FieldGroup>

      <TimestampTokenLegend />
    </div>

    {#if strayLetters.length > 0}
      <p class="text-destructive text-xs">
        <span class="font-mono">{strayLetters.join(", ")}</span>
        {strayLetters.length === 1 ? "is not a pattern token" : "are not pattern tokens"}.
      </p>
    {/if}

    {#if inference && inference.rivals.length > 0}
      <p class="text-muted-foreground text-xs">
        The sample also reads as <span class="font-mono">{inference.rivals.join(", ")}</span>.
        Confirm the order is correct.
      </p>
    {/if}

    <TimestampPatternPreview {values} pattern={previewPattern} {settling} />

    <Dialog.Footer>
      <Dialog.Close>
        {#snippet child({ props })}
          <Button {...props} variant="outline">Cancel</Button>
        {/snippet}
      </Dialog.Close>
      <Button onclick={apply} disabled={draft.trim() === ""}>Use pattern</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
