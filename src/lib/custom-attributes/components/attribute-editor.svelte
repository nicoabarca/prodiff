<script lang="ts">
  import { untrack } from "svelte";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { customAttributeImpact } from "$lib/custom-attributes/invokers/custom-attribute-impact";
  import type {
    AttributeScope,
    Formula,
    ResponseCustomAttributeImpact
  } from "$lib/custom-attributes/invokers/types";
  import { customAttributes } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import type { CustomAttributeDraft } from "$lib/custom-attributes/state/drafts.svelte";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import BlockPalette from "$lib/custom-attributes/components/block-palette.svelte";
  import FormulaBlocks from "$lib/custom-attributes/components/formula-blocks.svelte";
  import GranularityIcon from "$lib/custom-attributes/components/granularity-icon.svelte";
  import {
    fromBlocks,
    insertAt,
    insertCall,
    insertParentheses,
    insideCall,
    toBlocks,
    type Block,
    type BlockEdit
  } from "$lib/custom-attributes/utils/blocks";
  import { FUNCTIONS, parseFormula, type FunctionName } from "$lib/custom-attributes/utils/parser";
  import {
    allowedColumns,
    formulaColumnError,
    nameError
  } from "$lib/custom-attributes/utils/validate";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type { Project } from "$lib/event-log/types";
  import { formatNumber } from "$lib/format";

  let {
    project,
    attribute,
    draft,
    onsave,
    oncancel
  }: {
    project: Project;
    attribute: CustomAttribute | null;
    draft: CustomAttributeDraft;
    onsave: (draft: CustomAttributeDraft) => void;
    oncancel: () => void;
  } = $props();

  const IMPACT_DEBOUNCE = 250;

  // Seeded once, then the form owns its state. Callers remount via `{#key}` to
  // point the editor at a different attribute.
  const initial = untrack(() => draft);
  let name = $state(initial.name);
  let scope = $state<AttributeScope>(initial.scope);
  let text = $state(initial.formula);

  const SCOPES: { value: AttributeScope; label: string; description: string }[] = [
    { value: "event", label: "Event", description: "One value per event." },
    { value: "case", label: "Case", description: "One value per case, such as total cost per day." }
  ];

  const FUNCTION_DEFINITIONS: Record<FunctionName, string> = {
    sum: "The total of the case's values.",
    mean: "The average of the case's values.",
    median: "The middle of the case's values.",
    min: "The smallest of the case's values.",
    max: "The largest of the case's values.",
    first: "The first value in event order, skipping empty values.",
    last: "The last value in event order, skipping empty values.",
    count: "The number of events in the case.",
    duration: "Days from the case's earliest timestamp to its latest."
  };

  /**
   * The text is the formula; the blocks are its tokens. Text that does not
   * tokenize can only be edited as text, so the editor opens on text then.
   */
  const blocks = $derived(toBlocks(text));
  let editingText = $state(toBlocks(initial.formula) === null);
  let caret = $state(toBlocks(initial.formula)?.length ?? 0);
  const blockEdit = $derived<BlockEdit | null>(
    blocks ? { blocks, caret: Math.min(caret, blocks.length) } : null
  );
  const directColumns = $derived(allowedColumns(project, scope, "column").map((c) => c.name));
  const aggregateColumns = $derived(allowedColumns(project, scope, "aggregate").map((c) => c.name));
  const columnScopes = $derived(Object.fromEntries(project.columns.map((c) => [c.name, c.scope])));

  function changeBlocks(next: BlockEdit) {
    text = fromBlocks(next.blocks);
    caret = next.caret;
  }

  function insertBlocks(inserted: Block[]) {
    if (blockEdit) changeBlocks(insertAt(blockEdit, inserted));
  }

  function finishText() {
    if (!blocks) return;
    caret = blocks.length;
    editingText = false;
  }

  const nameProblem = $derived(nameError(name, project, customAttributes, attribute?.id ?? null));
  const parsed = $derived(parseFormula(text));
  const refusal = $derived(parsed.ok ? formulaColumnError(parsed.formula, project, scope) : null);
  const formulaProblem = $derived(parsed.ok ? (refusal?.message ?? null) : parsed.error);
  const formula = $derived<Formula | null>(parsed.ok && !formulaProblem ? parsed.formula : null);
  const valid = $derived(formula !== null && nameProblem === null);

  let impact = $state<ResponseCustomAttributeImpact | null>(null);
  let measuring = $state(false);
  let impactError = $state<string | null>(null);

  $effect(() => {
    const candidate = formula;
    const candidateScope = scope;
    impactError = null;
    if (!candidate) {
      impact = null;
      return;
    }

    let stale = false;
    measuring = true;
    const timer = setTimeout(() => {
      customAttributeImpact(project, candidateScope, candidate)
        .then((measured) => {
          if (stale) return;
          impact = measured;
          measuring = false;
        })
        .catch((cause) => {
          if (stale) return;
          impactError = String(cause);
          measuring = false;
        });
    }, IMPACT_DEBOUNCE);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  function unit(count: number): string {
    const noun = scope === "case" ? "case" : "event";
    return count === 1 ? noun : `${noun}s`;
  }

  function save() {
    if (valid) onsave({ name: name.trim(), scope, formula: text.trim() });
  }
</script>

<Field.FieldGroup>
  <Field.Field data-invalid={name !== "" && nameProblem ? true : undefined}>
    <Field.FieldLabel for="custom-attribute-name">
      Name
      <span class="text-muted-foreground font-normal">(required)</span>
    </Field.FieldLabel>
    <Input
      id="custom-attribute-name"
      bind:value={name}
      required
      placeholder="Ex. expenses per point"
      class="placeholder:text-muted-foreground/50"
    />
    {#if name !== "" && nameProblem}
      <Field.FieldError>{nameProblem}</Field.FieldError>
    {/if}
  </Field.Field>

  {#if attribute}
    <Field.Field>
      <Field.FieldLabel>Granularity</Field.FieldLabel>
      <Field.FieldDescription>
        <span class="text-foreground inline-flex items-center gap-1 font-medium">
          <GranularityIcon {scope} />
          {scope === "case" ? "Case attribute" : "Event attribute"}
        </span>
      </Field.FieldDescription>
    </Field.Field>
  {:else}
    <Field.FieldSet>
      <Field.FieldLegend variant="label">Granularity</Field.FieldLegend>
      <RadioGroup.Root value={scope} onValueChange={(next) => (scope = next as AttributeScope)}>
        {#each SCOPES as option (option.value)}
          <Field.Field orientation="horizontal">
            <RadioGroup.Item value={option.value} id="custom-attribute-scope-{option.value}" />
            <Field.FieldContent>
              <Field.FieldLabel for="custom-attribute-scope-{option.value}">
                <GranularityIcon scope={option.value} class="text-muted-foreground" />
                {option.label}
              </Field.FieldLabel>
              <Field.FieldDescription>{option.description}</Field.FieldDescription>
            </Field.FieldContent>
          </Field.Field>
        {/each}
      </RadioGroup.Root>
    </Field.FieldSet>
  {/if}

  <Field.Field data-invalid={text !== "" && formulaProblem ? true : undefined}>
    <div class="flex items-center justify-between gap-2">
      <Field.FieldLabel for="custom-attribute-formula">
        Formula
        <span class="text-muted-foreground font-normal">(required)</span>
      </Field.FieldLabel>
      {#if editingText}
        <Button
          variant="ghost"
          size="sm"
          class="h-6 text-xs"
          disabled={blocks === null}
          title={blocks === null ? "Fix the formula to edit it as blocks" : undefined}
          onclick={finishText}
        >
          Done
        </Button>
      {:else}
        <Button variant="ghost" size="sm" class="h-6 text-xs" onclick={() => (editingText = true)}>
          Edit as text
        </Button>
      {/if}
    </div>
    {#if editingText || !blockEdit}
      <Input
        id="custom-attribute-formula"
        bind:value={text}
        required
        placeholder="[expense] / [points]"
        class="placeholder:text-muted-foreground/50 font-mono"
        spellcheck={false}
        autocomplete="off"
      />
    {:else}
      <FormulaBlocks
        edit={blockEdit}
        scopes={columnScopes}
        flagged={refusal?.operand ?? null}
        onchange={changeBlocks}
      />
      {#if text !== ""}
        <p class="text-muted-foreground font-mono text-xs break-all">{text}</p>
      {/if}
    {/if}
    {#if text !== "" && formulaProblem}
      <Field.FieldError>{formulaProblem}</Field.FieldError>
    {:else}
      <Field.FieldDescription>
        {editingText
          ? scope === "case"
            ? "Put case columns in brackets, wrap event columns in a function such as sum([cost]), and combine them with + - * / and parentheses."
            : "Put number columns in brackets and combine them with + - * / and parentheses."
          : "Click a block to insert it at the caret. Arrow keys move the caret, Backspace removes the block before it."}
        A missing value or a division by zero reads as empty, not as an error.
      </Field.FieldDescription>
    {/if}
  </Field.Field>

  {#if !editingText && blockEdit}
    <Field.Field>
      <Field.FieldLabel>Building blocks</Field.FieldLabel>
      <BlockPalette
        columns={insideCall(blockEdit) ? aggregateColumns : directColumns}
        insideCall={insideCall(blockEdit)}
        columnScope={insideCall(blockEdit) ? "event" : scope}
        functions={scope === "case" ? FUNCTIONS : []}
        oninsert={insertBlocks}
        oncall={(fn) => blockEdit && changeBlocks(insertCall(blockEdit, fn))}
        onparentheses={() => blockEdit && changeBlocks(insertParentheses(blockEdit))}
      />
    </Field.Field>
  {/if}

  {#if scope === "case"}
    <Collapsible.Root>
      <Collapsible.Trigger
        class="text-muted-foreground hover:text-foreground group flex items-center gap-1 text-xs font-medium"
      >
        <ChevronRight class="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        Functions
      </Collapsible.Trigger>
      <Collapsible.Content>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {#each FUNCTIONS as fn (fn)}
            <dt class="font-mono">{fn}({fn === "count" || fn === "duration" ? "" : "[x]"})</dt>
            <dd class="text-muted-foreground">{FUNCTION_DEFINITIONS[fn]}</dd>
          {/each}
        </dl>
        <p class="text-muted-foreground mt-2 text-xs">
          A case column in brackets reads the row its case resolution names, even when that value is
          empty.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}

  {#if formula}
    <Field.FieldSeparator />
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-3">
    {#if formula}
      <Field.Field class="min-w-48 flex-1">
        <Field.FieldLabel>Impact of this draft</Field.FieldLabel>
        {#if impactError}
          <Field.FieldError>{impactError}</Field.FieldError>
        {:else if measuring || !impact}
          <Skeleton class="h-4 w-48" />
        {:else if impact.empty === 0}
          <Field.FieldDescription>
            Calculates all {formatNumber(impact.total)}
            {unit(impact.total)}.
          </Field.FieldDescription>
        {:else}
          <Field.FieldDescription>
            Calculates {formatNumber(impact.total - impact.empty)} of {formatNumber(impact.total)}
            {unit(impact.total)}.
            <span class="text-foreground font-medium">
              {formatNumber(impact.empty)}
              {unit(impact.empty)} could not be calculated
            </span>
            and will be empty.
          </Field.FieldDescription>
        {/if}
      </Field.Field>
    {/if}

    <div class="ml-auto flex shrink-0 gap-2">
      <Button variant="ghost" onclick={oncancel}>Cancel</Button>
      <Button disabled={!valid} onclick={save}>Save attribute</Button>
    </div>
  </div>
</Field.FieldGroup>
