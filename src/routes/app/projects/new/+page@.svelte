<script lang="ts">
  import { goto } from "$app/navigation";
  import { createProject } from "$lib/event-log/utils/create";
  import { fetchEventLogPreview } from "$lib/event-log/invokers/preview-event-log";
  import {
    requiredRoles,
    emptyAssignments,
    requiredFieldSettings,
    type AssignableRole
  } from "$lib/event-log/utils/roles";
  import {
    inferExtraFieldType,
    extraFieldTypeToColumnType,
    type ExtraFieldType
  } from "$lib/event-log/utils/field-settings";
  import type { ColumnGranularity, RequestColumnMapping, ColumnType } from "$lib/event-log/invokers/types";
  import WizardSteps from "$lib/event-log/components/wizard-steps.svelte";
  import UploadStep from "$lib/event-log/components/stepper/upload-step.svelte";
  import RequiredFieldsStep from "$lib/event-log/components/stepper/required-fields-step.svelte";
  import OtherFieldsStep from "$lib/event-log/components/stepper/other-fields-step.svelte";
  import FieldSettingsStep from "$lib/event-log/components/stepper/field-settings-step.svelte";
  import ReviewStep from "$lib/event-log/components/stepper/review-step.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  let step = $state<1 | 2 | 3 | 4 | 5>(1);

  let filePath = $state<string | null>(null);
  let fileName = $state<string | null>(null);
  let columns = $state<{ name: string; dtype: ColumnType }[]>([]);
  let rows = $state<string[][]>([]);
  let loadError = $state<string | null>(null);

  let assignments = $state<Record<AssignableRole, string | null>>(emptyAssignments());
  let activeRole = $state<AssignableRole | null>("case_id");
  let hoveredCol = $state<number | null>(null);
  let visibleColumns = $state<Set<string>>(new Set());
  let columnGranularity = $state<Record<string, ColumnGranularity>>({});
  let columnType = $state<Record<string, ExtraFieldType>>({});

  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  const roleByColumn = $derived.by(() => {
    const map: Record<string, AssignableRole> = {};
    for (const [role, col] of Object.entries(assignments) as [AssignableRole, string | null][]) {
      if (col) map[col] = role;
    }
    return map;
  });

  const allMapped = $derived(requiredRoles.every((r) => assignments[r] !== null));

  function acceptUpload(path: string, name: string) {
    filePath = path;
    fileName = name;
    loadError = null;
    columns = [];
    rows = [];
    fetchEventLogPreview(path)
      .then((preview) => {
        if (filePath !== path) return; // a newer upload started before this one resolved
        columns = preview.columns;
        rows = preview.rows;
      })
      .catch((err) => {
        if (filePath !== path) return;
        loadError = String(err);
      });
    step = 2;
  }

  function backToUpload() {
    filePath = null;
    fileName = null;
    columns = [];
    rows = [];
    loadError = null;
    assignments = emptyAssignments();
    activeRole = "case_id";
    visibleColumns = new Set();
    columnGranularity = {};
    columnType = {};
    step = 1;
  }

  function resetMapping() {
    assignments = emptyAssignments();
    activeRole = "case_id";
  }

  const columnMapping = $derived.by((): RequestColumnMapping[] =>
    columns.map(({ name, dtype }) => {
      const role = roleByColumn[name];
      if (role) {
        return { name, role, ...requiredFieldSettings[role] };
      }
      if (visibleColumns.has(name)) {
        const type = columnType[name] ?? inferExtraFieldType(dtype);
        return {
          name,
          role: "other",
          type: extraFieldTypeToColumnType(type),
          granularity: columnGranularity[name] ?? "event"
        };
      }
      return { name, role: "other", type: dtype, granularity: "event" };
    })
  );

  const hiddenColumnNames = $derived(
    columns.filter((c) => !roleByColumn[c.name] && !visibleColumns.has(c.name)).map((c) => c.name)
  );

  async function confirm() {
    if (!filePath || !fileName) return;
    submitting = true;
    submitError = null;
    try {
      const project = await createProject({ filePath, fileName }, columnMapping, hiddenColumnNames);
      goto(`/app/projects/${project.id}`);
    } catch (err) {
      submitError = String(err);
    } finally {
      submitting = false;
    }
  }
</script>

<main class="mx-auto flex h-screen w-full flex-col overflow-hidden px-8 py-8">
  <WizardSteps active={step} />

  {#if step === 1}
    <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center">
      <UploadStep onAccepted={acceptUpload} />
    </div>
  {:else if step === 2}
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 class="font-heading text-xl font-bold tracking-tight">Map columns</h1>
      <Button variant="outline" size="lg" onclick={resetMapping}>Reset</Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {#if loadError}
        <p
          class="border-destructive/40 bg-destructive/10 text-destructive border px-4 py-3 text-sm"
        >
          Couldn't read this file: {loadError}
        </p>
      {:else if columns.length === 0}
        <div class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
          <LoaderCircle class="h-6 w-6 animate-spin" aria-hidden="true" />
          <p class="text-sm">Reading <span class="font-mono">{fileName}</span>…</p>
        </div>
      {:else}
        <RequiredFieldsStep
          fileName={fileName ?? "event_log.csv"}
          {columns}
          {rows}
          bind:assignments
          bind:activeRole
          bind:hoveredCol
          {roleByColumn}
        />
      {/if}
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="lg" onclick={backToUpload}>Back</Button>
      <Button size="lg" disabled={!allMapped} onclick={() => (step = 3)}>Next</Button>
    </div>
  {:else if step === 3}
    <h1 class="font-heading mb-5 text-xl font-bold tracking-tight">Other fields</h1>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <OtherFieldsStep {columns} {rows} {roleByColumn} bind:visibleColumns bind:hoveredCol />
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="lg" onclick={() => (step = 2)}>Back</Button>
      <Button size="lg" onclick={() => (step = 4)}>Next</Button>
    </div>
  {:else if step === 4}
    <h1 class="font-heading mb-5 text-xl font-bold tracking-tight">Field settings</h1>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <FieldSettingsStep
        {columns}
        {rows}
        {roleByColumn}
        {visibleColumns}
        bind:columnGranularity
        bind:columnType
      />
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="lg" onclick={() => (step = 3)}>Back</Button>
      <Button size="lg" onclick={() => (step = 5)}>Next</Button>
    </div>
  {:else if step === 5}
    <h1 class="font-heading mb-5 text-xl font-bold tracking-tight">Review</h1>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ReviewStep
        fileName={fileName ?? "event_log.csv"}
        mapping={columnMapping}
        {roleByColumn}
        {hiddenColumnNames}
      />

      {#if submitError}
        <p
          class="border-destructive/40 bg-destructive/10 text-destructive mt-4 border px-4 py-3 text-sm"
        >
          {submitError}
        </p>
      {/if}
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="lg" onclick={() => (step = 4)}>Back</Button>
      <Button size="lg" disabled={submitting} onclick={confirm}>
        {#if submitting}
          <LoaderCircle data-icon="inline-start" class="animate-spin" />
          Creating…
        {:else}
          Confirm
        {/if}
      </Button>
    </div>
  {/if}
</main>
