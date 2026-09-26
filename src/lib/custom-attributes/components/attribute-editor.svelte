<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { customAttributeImpact } from "$lib/custom-attributes/invokers/custom-attribute-impact";
  import type {
    Formula,
    ResponseCustomAttributeImpact
  } from "$lib/custom-attributes/invokers/types";
  import { customAttributes } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import type { CustomAttributeDraft } from "$lib/custom-attributes/state/drafts.svelte";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import { parseFormula } from "$lib/custom-attributes/utils/parser";
  import { formulaColumnError, nameError } from "$lib/custom-attributes/utils/validate";
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
  let text = $state(initial.formula);

  const nameProblem = $derived(nameError(name, project, customAttributes, attribute?.id ?? null));
  const parsed = $derived(parseFormula(text));
  const formulaProblem = $derived(
    parsed.ok ? formulaColumnError(parsed.formula, project) : parsed.error
  );
  const formula = $derived<Formula | null>(parsed.ok && !formulaProblem ? parsed.formula : null);
  const valid = $derived(formula !== null && nameProblem === null);

  let impact = $state<ResponseCustomAttributeImpact | null>(null);
  let measuring = $state(false);
  let impactError = $state<string | null>(null);

  $effect(() => {
    const candidate = formula;
    impactError = null;
    if (!candidate) {
      impact = null;
      return;
    }

    let stale = false;
    measuring = true;
    const timer = setTimeout(() => {
      customAttributeImpact(project, candidate)
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

  function save() {
    if (valid) onsave({ name: name.trim(), formula: text.trim() });
  }
</script>

<Field.FieldGroup>
  <Field.Field data-invalid={name !== "" && nameProblem ? true : undefined}>
    <Field.FieldLabel for="custom-attribute-name">Name</Field.FieldLabel>
    <Input id="custom-attribute-name" bind:value={name} placeholder="Expense per point" />
    {#if name !== "" && nameProblem}
      <Field.FieldError>{nameProblem}</Field.FieldError>
    {/if}
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel>Scope</Field.FieldLabel>
    <Field.FieldDescription>
      <span class="text-foreground font-medium">Event</span>. One value for every event, from that
      event's own columns.
    </Field.FieldDescription>
  </Field.Field>

  <Field.Field data-invalid={text !== "" && formulaProblem ? true : undefined}>
    <Field.FieldLabel for="custom-attribute-formula">Formula</Field.FieldLabel>
    <Input
      id="custom-attribute-formula"
      bind:value={text}
      placeholder="[expense] / [points]"
      class="font-mono"
      spellcheck={false}
      autocomplete="off"
    />
    {#if text !== "" && formulaProblem}
      <Field.FieldError>{formulaProblem}</Field.FieldError>
    {:else}
      <Field.FieldDescription>
        Put number columns in brackets and combine them with + - * / and parentheses. A missing
        value or a division by zero reads as empty, not as an error.
      </Field.FieldDescription>
    {/if}
  </Field.Field>

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
            Calculates all {formatNumber(impact.events)} events.
          </Field.FieldDescription>
        {:else}
          <Field.FieldDescription>
            Calculates {formatNumber(impact.events - impact.empty)} of {formatNumber(impact.events)} events.
            <span class="text-foreground font-medium">
              {formatNumber(impact.empty)}
              {impact.empty === 1 ? "value" : "values"} could not be calculated
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
