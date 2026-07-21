<script lang="ts">
  import { goto } from "$app/navigation";
  import { invoke } from "@tauri-apps/api/core";
  import { draftUpload } from "$lib/state/projects.svelte";
  import { createProject } from "$lib/projects/create";
  import type { ColumnMapping, ColumnType, ColumnRole } from "$lib/column-mapping";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Check from "@lucide/svelte/icons/check";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";

  // The roles this step can assign. Every other ColumnRole — start_timestamp,
  // other — has no picker yet; unassigned columns fall through to "other".
  type AssignableRole = Extract<
    ColumnRole,
    "case_id" | "activity_name" | "complete_timestamp"
  >;

  const roleOrder: AssignableRole[] = ["case_id", "activity_name", "complete_timestamp"];

  const roleMeta: Record<AssignableRole, { step: number; label: string; hint: string }> = {
    case_id: { step: 1, label: "Case ID", hint: "Groups events into a single process instance" },
    activity_name: { step: 2, label: "Activity", hint: "The step or action performed" },
    complete_timestamp: {
      step: 3,
      label: "Complete timestamp",
      hint: "When the activity finished"
    }
  };

  const filePath = draftUpload.filePath;
  const fileName = draftUpload.fileName ?? "event_log.csv";

  if (!filePath) {
    goto("/app/projects/new");
  }

  let columns = $state<{ name: string; dtype: ColumnType }[]>([]);
  let rows = $state<string[][]>([]);
  let loadError = $state<string | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  $effect(() => {
    if (!filePath) return;
    invoke<{ columns: { name: string; dtype: ColumnType }[]; rows: string[][] }>(
      "preview_event_log",
      { path: filePath }
    )
      .then((preview) => {
        columns = preview.columns;
        rows = preview.rows;
      })
      .catch((err) => {
        loadError = String(err);
      });
  });

  let assignments = $state<Record<AssignableRole, string | null>>({
    case_id: null,
    activity_name: null,
    complete_timestamp: null
  });
  let activeRole = $state<AssignableRole | null>("case_id");

  const roleByColumn = $derived.by(() => {
    const map: Record<string, AssignableRole> = {};
    for (const role of roleOrder) {
      const col = assignments[role];
      if (col) map[col] = role;
    }
    return map;
  });

  const allMapped = $derived(roleOrder.every((r) => assignments[r] !== null));

  function firstUnassigned(next: Record<AssignableRole, string | null>): AssignableRole | null {
    return roleOrder.find((r) => next[r] === null) ?? null;
  }

  function handleColumnClick(col: string) {
    const existing = roleByColumn[col];
    if (existing) {
      assignments = { ...assignments, [existing]: null };
      activeRole = existing;
      return;
    }
    if (!activeRole) return;
    const next = { ...assignments, [activeRole]: col };
    assignments = next;
    activeRole = firstUnassigned(next);
  }

  function activateRole(role: AssignableRole) {
    assignments = { ...assignments, [role]: null };
    activeRole = role;
  }

  function reset() {
    assignments = { case_id: null, activity_name: null, complete_timestamp: null };
    activeRole = "case_id";
  }

  function back() {
    draftUpload.filePath = null;
    draftUpload.fileName = null;
    goto("/app/projects/new");
  }

  // ponytail: granularity has no picker yet, so every column is "event". Add
  // one when a feature actually needs case-level attributes.
  function buildColumnMapping(): ColumnMapping[] {
    return columns.map(({ name, dtype }) => ({
      name,
      role: roleByColumn[name] ?? "other",
      type: dtype,
      granularity: "event"
    }));
  }

  async function confirm() {
    if (!filePath || !allMapped) return;
    submitting = true;
    submitError = null;
    try {
      const project = await createProject(
        { filePath, fileName },
        buildColumnMapping()
      );
      draftUpload.filePath = null;
      draftUpload.fileName = null;
      goto(`/app/projects/${project.id}`);
    } catch (err) {
      submitError = String(err);
    } finally {
      submitting = false;
    }
  }
</script>

<main class="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-auto px-6 py-8">
  <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <h1 class="font-heading text-xl font-bold tracking-tight">Map columns</h1>
    <Button variant="outline" size="sm" onclick={reset}>
      <RotateCcw data-icon="inline-start" />
      Reset
    </Button>
  </div>

  <div class="border-primary bg-primary/5 mb-5 flex items-center gap-3 border-l-4 px-4 py-3">
    <MousePointerClick class="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
    <p class="text-foreground text-base font-medium text-pretty">
      Click the columns in <span class="font-mono">{fileName}</span> to assign the fields required.
    </p>
  </div>

  {#if loadError}
    <p class="border-destructive/40 bg-destructive/10 text-destructive border px-4 py-3 text-sm">
      Couldn't read this file: {loadError}
    </p>
  {:else}
    <div
      class={`mb-4 flex items-center gap-3 border px-4 py-3 text-sm ${
        activeRole
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground"
      }`}
    >
      {#if activeRole}
        <span
          class="border-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold"
        >
          {roleMeta[activeRole].step}
        </span>
        <span class="text-pretty">
          <span class="font-semibold tracking-wide uppercase"
            >Click the {roleMeta[activeRole].label} column</span
          >
          {" — "}
          {roleMeta[activeRole].hint}
        </span>
      {:else}
        <Check class="h-5 w-5 shrink-0" />
        <span class="font-semibold tracking-wide uppercase"
          >All fields mapped — review the highlights, then confirm</span
        >
      {/if}
    </div>

    <div class="border-border bg-border mb-4 grid grid-cols-1 gap-px border sm:grid-cols-3">
      {#each roleOrder as role}
        {@const col = assignments[role]}
        <button
          type="button"
          onclick={() => activateRole(role)}
          class={`bg-card hover:bg-accent flex items-center gap-3 p-3 text-left ${activeRole === role ? "bg-accent" : ""}`}
        >
          <span
            class={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
              col
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-muted-foreground border"
            }`}
          >
            {roleMeta[role].step}
          </span>
          <span class="min-w-0">
            <span
              class="text-muted-foreground block text-[0.625rem] font-semibold tracking-widest uppercase"
            >
              {roleMeta[role].label}
            </span>
            <span class="text-card-foreground block truncate font-mono text-sm">{col ?? "—"}</span>
          </span>
        </button>
      {/each}
    </div>

    <div class="border-border bg-card min-w-0 border">
      <div class="border-border flex items-center justify-between border-b px-4 py-2">
        <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
          >Sample preview</span
        >
        <span class="text-muted-foreground text-xs">First {rows.length} rows</span>
      </div>
      <div class="max-h-105 overflow-auto">
        <Table.Root class="border-collapse">
          <Table.Header class="sticky top-0 z-10">
            <Table.Row class="hover:bg-transparent">
              {#each columns as { name: col }}
                {@const role = roleByColumn[col]}
                <Table.Head class="p-0">
                  <button
                    type="button"
                    onclick={() => handleColumnClick(col)}
                    class={`border-border flex w-full items-center gap-2 border-b px-3 py-2 text-left font-mono text-xs whitespace-nowrap transition-colors ${
                      role
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {#if role}
                      <span
                        class="border-primary-foreground flex h-4 w-4 shrink-0 items-center justify-center border text-[0.625rem] font-bold"
                      >
                        {roleMeta[role].step}
                      </span>
                    {/if}
                    <span class="flex flex-col">
                      <span>{col}</span>
                      {#if role}
                        <span
                          class="text-[0.625rem] font-semibold tracking-wide uppercase opacity-90"
                        >
                          {roleMeta[role].label}
                        </span>
                      {/if}
                    </span>
                  </button>
                </Table.Head>
              {/each}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each rows as row}
              <Table.Row>
                {#each row as cell, j}
                  {@const colName = columns[j].name}
                  {@const mapped = !!roleByColumn[colName]}
                  <Table.Cell
                    onclick={() => handleColumnClick(colName)}
                    class={`cursor-pointer px-3 py-1.5 font-mono text-xs whitespace-nowrap transition-colors ${
                      mapped
                        ? "bg-accent text-accent-foreground hover:bg-accent/70"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {cell}
                  </Table.Cell>
                {/each}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </div>
  {/if}

  {#if submitError}
    <p
      class="border-destructive/40 bg-destructive/10 text-destructive mt-4 border px-4 py-3 text-sm"
    >
      {submitError}
    </p>
  {/if}

  <div class="mt-5 flex items-center justify-between gap-3">
    <Button variant="outline" onclick={back}>Back</Button>
    <Button disabled={!allMapped || submitting} onclick={confirm}>
      {submitting ? "Creating…" : "Confirm mapping"}
    </Button>
  </div>
</main>
