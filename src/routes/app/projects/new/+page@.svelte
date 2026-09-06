<script lang="ts">
  import { goto } from "$app/navigation";
  import { createProject } from "$lib/event-log/utils/create";
  import { fetchEventLogPreview } from "$lib/event-log/invokers/preview-event-log";
  import {
    requiredRoles,
    emptyAssignments,
    requiredFieldSettings,
    type AssignableRole,
    type ColumnPick
  } from "$lib/event-log/utils/roles";
  import {
    inferExtraFieldType,
    extraFieldTypeToColumnType,
    type ExtraFieldType
  } from "$lib/event-log/utils/field-settings";
  import type {
    ColumnGranularity,
    RequestColumnMapping,
    ColumnType
  } from "$lib/event-log/invokers/types";
  import {
    inferFormat,
    FORMAT_CATALOG,
    type FormatInference
  } from "$lib/event-log/utils/timestamp-format";
  import { analyzeTimestampColumns } from "$lib/event-log/invokers/analyze-timestamp-columns";
  import {
    checkFromReport,
    formatCheckDetail,
    formatCheckMessage,
    patternUnresolved
  } from "$lib/event-log/utils/format-check";
  import type { FormatCheck } from "$lib/event-log/types";
  import { toast } from "svelte-sonner";
  import WizardSteps from "$lib/event-log/components/wizard-steps.svelte";
  import UploadStep from "$lib/event-log/components/stepper/upload-step.svelte";
  import MapColumnsStep from "$lib/event-log/components/stepper/map-columns-step.svelte";
  import FieldSettingsStep from "$lib/event-log/components/stepper/field-settings-step.svelte";
  import ReviewStep from "$lib/event-log/components/stepper/review-step.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  // Milliseconds. Long enough to read a count and a sample value before the
  // toast leaves; the same warning stays reachable on the field's icon.
  const FORMAT_TOAST_DURATION = 12000;

  let step = $state<1 | 2 | 3 | 4>(1);

  let filePath = $state<string | null>(null);
  let fileName = $state<string | null>(null);
  let columns = $state<{ name: string; dtype: ColumnType }[]>([]);
  let rows = $state<string[][]>([]);
  let loadError = $state<string | null>(null);

  let assignments = $state<Record<AssignableRole, string | null>>(emptyAssignments());
  let activeRole = $state<ColumnPick | null>("case_id");
  let hoveredCol = $state<number | null>(null);
  let visibleColumns = $state<Set<string>>(new Set());
  let columnGranularity = $state<Record<string, ColumnGranularity>>({});
  let columnType = $state<Record<string, ExtraFieldType>>({});
  // Inference runs once, over every column, the moment the preview lands —
  // nothing in a preview marks which columns are temporal (the reader parses no
  // dates), and by the time the user assigns a timestamp role or declares a
  // column Datetime the answer has to already be there.
  let formatInference = $state<Record<string, FormatInference>>({});
  let columnTimestampFormat = $state<Record<string, string>>({});
  // What the full-file pass made of each temporal column, keyed by column. The
  // preview's fifty rows can only guess a format; these counts cover every row.
  let formatChecks = $state<Record<string, FormatCheck>>({});
  // The pattern each column was last counted against. A memo, not state: it
  // decides whether a check is worth running and must not retrigger the effect
  // that writes it.
  let checkedFormat: Record<string, string> = {};
  // Columns whose counts are out of date, from the moment the format changes
  // until the file has been read again. The step cannot be left while it holds
  // anything: the mapping would carry a format nobody has checked.
  let checkingColumns = $state<string[]>([]);
  // The last pattern the user set by hand. Logs usually spell every timestamp
  // the same way, so it fills in for every temporal column they have not set
  // themselves, and the columns they have keep what they were given.
  let lastTimestampFormat = $state<string | null>(null);
  let chosenFormats = $state<Set<string>>(new Set());

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
        seedTimestampFormats(preview.columns, preview.rows);
      })
      .catch((err) => {
        if (filePath !== path) return;
        loadError = String(err);
      });
    step = 2;
  }

  function seedTimestampFormats(
    previewColumns: { name: string; dtype: ColumnType }[],
    previewRows: string[][]
  ) {
    const inferences: Record<string, FormatInference> = {};
    const formats: Record<string, string> = {};
    previewColumns.forEach((column, index) => {
      const inference = inferFormat(previewRows.map((row) => row[index] ?? ""));
      inferences[column.name] = inference;
      if (inference.pattern) formats[column.name] = inference.pattern;
    });
    formatInference = inferences;
    columnTimestampFormat = formats;
    formatChecks = {};
    checkedFormat = {};
    checkingColumns = [];
    lastTimestampFormat = null;
    chosenFormats = new Set();
  }

  function columnValues(name: string): string[] {
    const index = columns.findIndex((c) => c.name === name);
    return index === -1 ? [] : rows.map((row) => row[index] ?? "");
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
    formatInference = {};
    columnTimestampFormat = {};
    formatChecks = {};
    checkedFormat = {};
    checkingColumns = [];
    lastTimestampFormat = null;
    chosenFormats = new Set();
    step = 1;
  }

  function temporal(type: ColumnType): boolean {
    return type === "date" || type === "datetime";
  }

  const columnMapping = $derived.by((): RequestColumnMapping[] =>
    columns.map(({ name, dtype }) => {
      const role = roleByColumn[name];
      if (role) {
        const settings = requiredFieldSettings[role];
        return {
          name,
          role,
          ...settings,
          timestampFormat: temporal(settings.type) ? (columnTimestampFormat[name] ?? null) : null
        };
      }
      if (visibleColumns.has(name)) {
        const type = extraFieldTypeToColumnType(columnType[name] ?? inferExtraFieldType(dtype));
        return {
          name,
          role: "other",
          type,
          granularity: columnGranularity[name] ?? "event",
          // A stray entry for a column nobody declared temporal stays out of the
          // payload: the mapping is only allowed to carry a format where the
          // declared type can use one.
          timestampFormat: temporal(type) ? (columnTimestampFormat[name] ?? null) : null
        };
      }
      return { name, role: "other", type: dtype, granularity: "event", timestampFormat: null };
    })
  );

  function rememberFormat(column: string, pattern: string) {
    lastTimestampFormat = pattern;
    chosenFormats = new Set(chosenFormats).add(column);
  }

  // A pattern the user set by hand carries over to every other timestamp column
  // they have not set themselves, replacing whatever inference guessed there.
  $effect(() => {
    const carried = lastTimestampFormat;
    if (!carried) return;
    const next = { ...columnTimestampFormat };
    let changed = false;
    for (const column of columnMapping) {
      if (!temporal(column.type) || chosenFormats.has(column.name)) continue;
      if (next[column.name] === carried) continue;
      next[column.name] = carried;
      changed = true;
    }
    if (changed) columnTimestampFormat = next;
  });

  // Every column the mapping declares temporal, paired with the format in force,
  // which is null while the preview's rows told inference nothing. A change here
  // is what sends the file back to Rust to be counted, and a null pattern asks
  // Rust which of the catalog reads the column best.
  const declaredFormats = $derived(
    columnMapping
      .filter((c) => temporal(c.type))
      .map((c) => ({ column: c.name, pattern: c.timestampFormat }))
  );

  $effect(() => {
    const path = filePath;
    const pending = declaredFormats.filter((f) => checkedFormat[f.column] !== (f.pattern ?? ""));
    if (!path || pending.length === 0) return;
    checkingColumns = pending.map((p) => p.column);
    // A custom pattern changes on every keystroke; the file is read once the
    // typing settles.
    const timer = setTimeout(() => void runFormatChecks(path, pending), 400);
    return () => clearTimeout(timer);
  });

  async function runFormatChecks(
    path: string,
    pending: { column: string; pattern: string | null }[]
  ) {
    for (const { column, pattern } of pending) checkedFormat[column] = pattern ?? "";
    // A column with no pattern yet is measured against the whole catalog, so the
    // reply can name the one that reads it best.
    const asked = pending.some((p) => !p.pattern)
      ? FORMAT_CATALOG
      : [...new Set(pending.map((p) => p.pattern as string))];
    let reports;
    try {
      reports = await analyzeTimestampColumns(
        path,
        pending.map((p) => p.column),
        asked
      );
    } catch (err) {
      for (const { column } of pending) delete checkedFormat[column];
      checkingColumns = [];
      toast.error("Couldn't check the timestamp format", {
        description: String(err),
        duration: FORMAT_TOAST_DURATION
      });
      return;
    }
    checkingColumns = [];
    if (filePath !== path) return; // a newer upload started before this one resolved
    const next = { ...formatChecks };
    const adopted: Record<string, string> = {};
    for (const report of reports) {
      const asking = pending.find((p) => p.column === report.column);
      if (!asking) continue;
      const pattern = asking.pattern ?? report.best;
      if (!pattern) continue; // nothing in the catalog reads this column
      if (!asking.pattern) adopted[report.column] = pattern;
      checkedFormat[report.column] = pattern;
      const check = checkFromReport(report, pattern);
      next[report.column] = check;
      if (check.failed > 0) {
        toast.warning(formatCheckMessage(report.column, check), {
          description: formatCheckDetail(check, { total: true }),
          duration: FORMAT_TOAST_DURATION
        });
      }
    }
    formatChecks = next;
    if (Object.keys(adopted).length > 0) {
      columnTimestampFormat = { ...columnTimestampFormat, ...adopted };
    }
  }

  // A temporal column with no pattern that reads it would import as all nulls,
  // so the wizard does not move past it.
  const unresolvedFormats = $derived(
    declaredFormats
      .filter(({ column, pattern }) => patternUnresolved(pattern ?? "", formatChecks[column]))
      .map(({ column }) => column)
  );

  const formatsSettled = $derived(checkingColumns.length === 0 && unresolvedFormats.length === 0);

  const hiddenColumnNames = $derived(
    columns.filter((c) => !roleByColumn[c.name] && !visibleColumns.has(c.name)).map((c) => c.name)
  );

  async function confirm() {
    if (!filePath || !fileName || !formatsSettled) return;
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
    <!--
      The step itself does not scroll: the cards are fixed and the table below
      owns the remaining height, which is what keeps its bottom scrollbar on
      screen.
    -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
        <MapColumnsStep
          {columns}
          {rows}
          bind:assignments
          bind:activeRole
          bind:hoveredCol
          bind:visibleColumns
          {roleByColumn}
          {formatInference}
          {formatChecks}
          {checkingColumns}
          {columnValues}
          bind:columnTimestampFormat
          onFormatChosen={rememberFormat}
        />
      {/if}
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <AlertDialog.Root>
          <AlertDialog.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="outline" size="lg">Cancel</Button>
            {/snippet}
          </AlertDialog.Trigger>
          <AlertDialog.Content>
            <AlertDialog.Header>
              <AlertDialog.Title>Choose another file?</AlertDialog.Title>
              <AlertDialog.Description>
                The columns you mapped and the timestamp formats you picked are discarded.
              </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
              <AlertDialog.Cancel>Stay here</AlertDialog.Cancel>
              <AlertDialog.Action onclick={backToUpload}>Discard mapping</AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </div>
      <Button size="lg" disabled={!allMapped || !formatsSettled} onclick={() => (step = 3)}
        >Next</Button
      >
    </div>
  {:else if step === 3}
    <h1 class="font-heading mb-5 text-xl font-bold tracking-tight">Field settings</h1>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <FieldSettingsStep
        {columns}
        {rows}
        {roleByColumn}
        {visibleColumns}
        bind:columnGranularity
        bind:columnType
        {formatInference}
        {formatChecks}
        {checkingColumns}
        {columnValues}
        bind:columnTimestampFormat
        onFormatChosen={rememberFormat}
      />
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <Button variant="outline" size="lg" onclick={() => (step = 2)}>Back</Button>
      <Button size="lg" disabled={!formatsSettled} onclick={() => (step = 4)}>Next</Button>
    </div>
  {:else if step === 4}
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
      <Button variant="outline" size="lg" onclick={() => (step = 3)}>Back</Button>
      <Button size="lg" disabled={submitting || !formatsSettled} onclick={confirm}>
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
