<script lang="ts">
  /**
   * One box plot at full size: every value on a symlog axis, with one dot per
   * outlier. The outliers are fetched each time the Dialog opens; a response
   * that a later open or a close has overtaken is dropped.
   */
  import { untrack } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import BoxChart from "$lib/analysis/components/box-chart.svelte";
  import type { OutlierLoad, Outliers } from "$lib/analysis/types";
  import { fullDomain, symlogConstant, type BoxRow } from "$lib/analysis/utils/box-plot";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  type Request =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; outliers: Record<string, Outliers> }
    | { status: "error"; message: string };

  let {
    open = $bindable(false),
    title,
    rows,
    load,
    format,
    formatCount,
    orientation = "vertical"
  }: {
    open?: boolean;
    title: string;
    rows: BoxRow[];
    load: OutlierLoad;
    format: (value: number) => string;
    formatCount: (value: number) => string;
    orientation?: "vertical" | "horizontal";
  } = $props();

  let request = $state<Request>({ status: "idle" });
  let latest = 0;

  function fetchOutliers() {
    const mine = ++latest;
    request = { status: "loading" };
    load().then(
      (outliers) => {
        if (mine === latest) request = { status: "ready", outliers };
      },
      (cause) => {
        if (mine === latest) request = { status: "error", message: String(cause) };
      }
    );
  }

  $effect(() => {
    if (open) {
      untrack(fetchOutliers);
    } else {
      latest += 1;
      request = { status: "idle" };
    }
  });

  const domain = $derived(fullDomain(rows));
  const constant = $derived(symlogConstant(rows, domain[0], domain[1]));
  const dots = $derived.by(() => {
    if (request.status !== "ready") return undefined;
    const { outliers } = request;
    return Object.fromEntries(
      rows.map((row) => {
        const found = outliers[row.id];
        return [row.id, found ? [...found.low, ...found.high] : []];
      })
    );
  });
  const horizontal = $derived(orientation === "horizontal");
  const padding = $derived(
    horizontal ? { left: 8, right: 16, bottom: 28 } : { left: 64, right: 12, bottom: 8, top: 8 }
  );
  const columns = $derived([
    ["n", (row: BoxRow) => (row.n === undefined ? "—" : formatCount(row.n))],
    ["Min", (row: BoxRow) => format(row.min)],
    ["Q1", (row: BoxRow) => format(row.q1)],
    ["Median", (row: BoxRow) => format(row.median)],
    ["Q3", (row: BoxRow) => format(row.q3)],
    ["Max", (row: BoxRow) => format(row.max)],
    ["IQR", (row: BoxRow) => format(row.q3 - row.q1)],
    ["Below", (row: BoxRow) => formatCount(row.outliersLow)],
    ["Above", (row: BoxRow) => formatCount(row.outliersHigh)]
  ] as const);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="h-[80vh] w-[90vw] max-w-[90vw] grid-rows-[auto_1fr] sm:max-w-[90vw]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        Every value, with one dot per outlier. The scale is linear near zero and logarithmic beyond
        it.
      </Dialog.Description>
      <table class="w-max text-[0.6875rem]">
        <thead>
          <tr class="text-muted-foreground">
            <th class="pr-4 text-left font-normal">Group</th>
            {#each columns as [heading] (heading)}
              <th class="px-2 text-right font-normal">{heading}</th>
            {/each}
          </tr>
        </thead>
        <tbody class="font-mono tabular-nums">
          {#each rows as row (row.id)}
            <tr>
              <td class="pr-4 font-sans font-semibold">
                <span class="flex items-center gap-1.5">
                  <span class="size-2 shrink-0" style="background:{row.color}" aria-hidden="true"
                  ></span>
                  {row.name}
                </span>
              </td>
              {#each columns as [heading, cell] (heading)}
                <td class="px-2 text-right whitespace-nowrap">{cell(row)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </Dialog.Header>
    <div class="relative min-h-0">
      {#if request.status === "error"}
        <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p class="text-destructive text-xs">{request.message}</p>
          <Button variant="outline" size="sm" onclick={fetchOutliers}>Retry</Button>
        </div>
      {:else}
        <BoxChart
          {rows}
          {domain}
          {constant}
          {format}
          {formatCount}
          {orientation}
          {dots}
          {padding}
          bandLabels={false}
          hover="value"
        />
        {#if request.status !== "ready"}
          <div class="absolute inset-0 flex items-center justify-center">
            <LoaderCircle
              class="text-muted-foreground size-8 animate-spin"
              aria-label="Loading outliers"
            />
          </div>
        {/if}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
