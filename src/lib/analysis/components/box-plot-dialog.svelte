<script lang="ts">
  /**
   * One box plot at full size: every value on a symlog axis, with one dot per
   * outlier. The outliers are fetched each time the Dialog opens; a response
   * that a later open or a close has overtaken is dropped. With
   * `alternatives`, a switch redraws the same values under the adjusted box
   * plot rule or as a letter-value plot, each fetched the first time it is
   * picked while the Dialog is open.
   */
  import { untrack } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import BoxChart from "$lib/analysis/components/box-chart.svelte";
  import type {
    AdjustedBox,
    BoxAlternatives,
    LetterValues,
    OutlierLoad,
    Outliers
  } from "$lib/analysis/types";
  import { fullDomain, symlogConstant, type BoxRow } from "$lib/analysis/utils/box-plot";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  type Request<T> =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; data: T }
    | { status: "error"; message: string };

  let {
    open = $bindable(false),
    title,
    rows,
    load,
    alternatives,
    format,
    formatCount,
    orientation = "vertical"
  }: {
    open?: boolean;
    title: string;
    rows: BoxRow[];
    load: OutlierLoad;
    alternatives?: BoxAlternatives;
    format: (value: number) => string;
    formatCount: (value: number) => string;
    orientation?: "vertical" | "horizontal";
  } = $props();

  let request = $state<Request<Record<string, Outliers>>>({ status: "idle" });
  let latest = 0;

  type Mode = "tukey" | "adjusted" | "letters";
  const MODES: { value: Mode; label: string }[] = [
    { value: "tukey", label: "Box plot" },
    { value: "adjusted", label: "Adjusted for skew" },
    { value: "letters", label: "Letter-value" }
  ];
  let mode = $state<Mode>("tukey");

  let adjustedRequest = $state<Request<Record<string, AdjustedBox>>>({ status: "idle" });
  let latestAdjusted = 0;
  let lettersRequest = $state<Request<Record<string, LetterValues>>>({ status: "idle" });
  let latestLetters = 0;

  function fetchOutliers() {
    const mine = ++latest;
    request = { status: "loading" };
    load().then(
      (data) => {
        if (mine === latest) request = { status: "ready", data };
      },
      (cause) => {
        if (mine === latest) request = { status: "error", message: String(cause) };
      }
    );
  }

  function fetchLetters() {
    if (!alternatives) return;
    const mine = ++latestLetters;
    lettersRequest = { status: "loading" };
    alternatives.letterValues().then(
      (data) => {
        if (mine === latestLetters) lettersRequest = { status: "ready", data };
      },
      (cause) => {
        if (mine === latestLetters) lettersRequest = { status: "error", message: String(cause) };
      }
    );
  }

  function fetchAdjusted() {
    if (!alternatives) return;
    const mine = ++latestAdjusted;
    adjustedRequest = { status: "loading" };
    alternatives.adjusted().then(
      (data) => {
        if (mine === latestAdjusted) adjustedRequest = { status: "ready", data };
      },
      (cause) => {
        if (mine === latestAdjusted) adjustedRequest = { status: "error", message: String(cause) };
      }
    );
  }

  $effect(() => {
    if (open) {
      untrack(fetchOutliers);
    } else {
      latest += 1;
      request = { status: "idle" };
      latestAdjusted += 1;
      adjustedRequest = { status: "idle" };
      latestLetters += 1;
      lettersRequest = { status: "idle" };
    }
  });

  $effect(() => {
    if (!open) return;
    if (mode === "adjusted" && untrack(() => adjustedRequest.status === "idle")) {
      untrack(fetchAdjusted);
    }
    if (mode === "letters" && untrack(() => lettersRequest.status === "idle")) {
      untrack(fetchLetters);
    }
  });

  /** What the plot draws: the Tukey rows, or the same rows with that mode's whiskers and counts. */
  const active = $derived(
    mode === "adjusted" ? adjustedRequest : mode === "letters" ? lettersRequest : request
  );
  const shown = $derived.by((): BoxRow[] => {
    if (mode === "letters" && lettersRequest.status === "ready") {
      const plots = lettersRequest.data;
      return rows.map((row) => {
        const plot = plots[row.id];
        return plot
          ? { ...row, outliersLow: plot.low.length, outliersHigh: plot.high.length }
          : row;
      });
    }
    if (mode !== "adjusted" || adjustedRequest.status !== "ready") return rows;
    const boxes = adjustedRequest.data;
    return rows.map((row) => {
      const box = boxes[row.id];
      if (!box) return row;
      return {
        ...row,
        whiskerLow: box.whiskerLow,
        whiskerHigh: box.whiskerHigh,
        outliersLow: box.low.length,
        outliersHigh: box.high.length
      };
    });
  });
  const medcouples = $derived(
    mode === "adjusted" && adjustedRequest.status === "ready" ? adjustedRequest.data : null
  );
  const letters = $derived(
    mode === "letters" && lettersRequest.status === "ready"
      ? Object.fromEntries(
          Object.entries(lettersRequest.data).map(([id, plot]) => [id, plot.boxes])
        )
      : undefined
  );

  const domain = $derived(fullDomain(rows));
  const constant = $derived(symlogConstant(rows, domain[0], domain[1]));
  const dots = $derived.by(() => {
    if (active.status !== "ready") return undefined;
    const outliers: Record<string, Outliers> = active.data;
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
        {#if mode === "letters"}
          Each box past the middle one holds the next half of the tail: eighths, sixteenths and
          further out, until about 8 to 16 cases are left on each side. Only those cases are dots.
        {:else if mode === "adjusted"}
          Whiskers follow the adjusted box plot rule, which widens them on the skewed side by the
          medcouple (MC), a skew measure from -1 to 1.
        {/if}
      </Dialog.Description>
      {#if alternatives}
        <div class="flex gap-1" role="group" aria-label="Drawing">
          {#each MODES as option (option.value)}
            <Button
              variant={mode === option.value ? "default" : "outline"}
              size="sm"
              aria-pressed={mode === option.value}
              onclick={() => (mode = option.value)}
            >
              {option.label}
            </Button>
          {/each}
        </div>
      {/if}
      <table class="w-max text-[0.6875rem]">
        <thead>
          <tr class="text-muted-foreground">
            <th class="pr-4 text-left font-normal">Group</th>
            {#each columns as [heading] (heading)}
              <th class="px-2 text-right font-normal">{heading}</th>
            {/each}
            {#if medcouples}
              <th class="px-2 text-right font-normal">MC</th>
            {/if}
          </tr>
        </thead>
        <tbody class="font-mono tabular-nums">
          {#each shown as row (row.id)}
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
              {#if medcouples}
                <td class="px-2 text-right whitespace-nowrap">
                  {medcouples[row.id]?.medcouple.toFixed(2) ?? "—"}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </Dialog.Header>
    <div class="relative min-h-0">
      {#if active.status === "error"}
        <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p class="text-destructive text-xs">{active.message}</p>
          <Button
            variant="outline"
            size="sm"
            onclick={mode === "adjusted"
              ? fetchAdjusted
              : mode === "letters"
                ? fetchLetters
                : fetchOutliers}
          >
            Retry
          </Button>
        </div>
      {:else}
        <BoxChart
          rows={shown}
          {domain}
          {constant}
          {format}
          {formatCount}
          {orientation}
          {dots}
          {letters}
          {padding}
          bandLabels={false}
          hover="value"
        />
        {#if active.status !== "ready"}
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
