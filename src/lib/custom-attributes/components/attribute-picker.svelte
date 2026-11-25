<script lang="ts">
  /**
   * The table of attributes to test, in Case, Event and Derived sections. Holds
   * no selection: every change reaches the caller as the whole next selection
   * through `onChange`. A click flips one row. Shift+click sets every row from
   * the last clicked one to the clicked one. Shift+drag sets every row from the
   * pressed one to the one under the pointer, and dragging back undoes it.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import {
    analysisColumns,
    attributeLabel
  } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import {
    GRANULARITY_LABELS,
    attributeRows,
    attributeSections,
    namesBetween,
    withNames
  } from "$lib/custom-attributes/utils/attribute-rows";
  import type { Project } from "$lib/event-log/types";
  import { cn } from "$lib/utils";

  let {
    project,
    options,
    selected,
    onChange,
    class: className
  }: {
    project: Project;
    options: string[];
    selected: string[];
    onChange: (next: string[]) => void;
    class?: string;
  } = $props();

  const sections = $derived(attributeSections(attributeRows(options, analysisColumns(project))));
  const order = $derived(sections.flatMap((section) => section.rows.map((row) => row.name)));
  const chosen = $derived(new Set(selected));
  const count = $derived(options.filter((name) => chosen.has(name)).length);

  let anchor: string | null = null;
  let drag: { origin: string; paint: boolean; base: string[]; moved: boolean } | null = null;

  function set(names: string[], on: boolean) {
    onChange(withNames(selected, names, on));
  }

  function press(event: PointerEvent, name: string) {
    if (event.button !== 0 || !event.shiftKey) return;
    const target = event.target as Element;
    // Touch captures the pointer to the pressed row, which hides the other rows from the drag.
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    drag = { origin: name, paint: !chosen.has(name), base: selected, moved: false };
  }

  function enter(name: string) {
    if (!drag || (name === drag.origin && !drag.moved)) return;
    drag.moved = true;
    onChange(withNames(drag.base, namesBetween(order, drag.origin, name), drag.paint));
  }

  // The click that ends a drag arrives after pointerup, so the drag is kept until it is handled.
  function release() {
    if (drag) setTimeout(() => (drag = null));
  }

  function choose(event: MouseEvent | KeyboardEvent, name: string) {
    if (drag?.moved) {
      anchor = drag.origin;
      return;
    }
    const on = !chosen.has(name);
    set(event.shiftKey && anchor !== null ? namesBetween(order, anchor, name) : [name], on);
    anchor = name;
  }
</script>

<svelte:window onpointerup={release} onpointercancel={release} />

<div class={cn("flex min-h-0 flex-col gap-2", className)}>
  <div class="flex items-center justify-between gap-2">
    <span class="text-muted-foreground text-xs tabular-nums">
      {count} of {options.length} tested
    </span>
    <div class="flex gap-1">
      <Button
        variant="outline"
        size="xs"
        disabled={count === options.length}
        onclick={() => set(options, true)}>Select all</Button
      >
      <Button variant="outline" size="xs" disabled={count === 0} onclick={() => set(options, false)}
        >Clear</Button
      >
    </div>
  </div>

  {#if options.length === 0}
    <p class="text-muted-foreground text-xs">
      This project has no attribute columns beyond the required fields.
    </p>
  {:else}
    <div class="border-border min-h-0 overflow-y-auto border">
      <table class="w-full border-collapse text-xs">
        <thead class="bg-background text-muted-foreground sticky top-0 z-20">
          <tr class="border-border border-b">
            <th class="w-8"></th>
            <th class="px-2 py-1.5 text-left font-semibold">Name</th>
            <th class="px-2 py-1.5 text-left font-semibold">Data type</th>
          </tr>
        </thead>
        {#each sections as section (section.granularity)}
          {@const names = section.rows.map((row) => row.name)}
          {@const on = names.filter((name) => chosen.has(name)).length}
          <tbody>
            <tr class="bg-muted">
              <td class="px-2 py-1">
                <Checkbox
                  aria-label="All {GRANULARITY_LABELS[section.granularity]} attributes"
                  bind:checked={() => on === names.length, () => set(names, on < names.length)}
                  bind:indeterminate={() => on > 0 && on < names.length, () => {}}
                />
              </td>
              <td
                colspan="2"
                class="px-2 py-1 text-[0.625rem] font-semibold tracking-wide uppercase"
              >
                {GRANULARITY_LABELS[section.granularity]} attributes
                <span class="text-muted-foreground ml-1 tabular-nums">{on}/{names.length}</span>
              </td>
            </tr>
            {#each section.rows as row (row.name)}
              {@const checked = chosen.has(row.name)}
              <tr
                tabindex="0"
                aria-selected={checked}
                class="border-border hover:bg-accent cursor-pointer border-t select-none"
                onpointerdown={(event) => press(event, row.name)}
                onpointerenter={() => enter(row.name)}
                onclick={(event) => choose(event, row.name)}
                onkeydown={(event) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  event.preventDefault();
                  choose(event, row.name);
                }}
              >
                <td class="py-1 pr-2 pl-5">
                  <Checkbox
                    {checked}
                    tabindex={-1}
                    aria-hidden="true"
                    class="pointer-events-none"
                  />
                </td>
                <td class="max-w-0 truncate px-2 py-1" title={attributeLabel(row.name)}>
                  <AttributeName name={row.name} />
                </td>
                <td class="text-muted-foreground px-2 py-1 whitespace-nowrap">{row.dataType}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
      </table>
    </div>
    <p class="text-muted-foreground text-[0.625rem]">
      Shift+click to select a range.
    </p>
  {/if}
</div>
