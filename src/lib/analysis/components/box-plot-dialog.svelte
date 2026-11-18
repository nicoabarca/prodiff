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
  const count = (n: number, side: string) =>
    `${formatCount(n)} ${n === 1 ? "value" : "values"} ${side}`;
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="h-[80vh] w-[90vw] max-w-[90vw] grid-rows-[auto_1fr] sm:max-w-[90vw]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        Every value, with one dot per outlier. The scale is linear near zero and logarithmic beyond
        it.
      </Dialog.Description>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
        {#each rows as row (row.id)}
          <li class="flex items-center gap-1.5">
            <span class="size-2 shrink-0" style="background:{row.color}" aria-hidden="true"></span>
            <span class="font-semibold">{row.name}</span>
            <span class="text-muted-foreground">
              {count(row.outliersLow, "below")} · {count(row.outliersHigh, "above")}
            </span>
          </li>
        {/each}
      </ul>
    </Dialog.Header>
    <div class="relative min-h-0">
      {#if request.status === "error"}
        <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p class="text-destructive text-xs">{request.message}</p>
          <Button variant="outline" size="sm" onclick={fetchOutliers}>Retry</Button>
        </div>
      {:else}
        <BoxChart {rows} {domain} {constant} {format} {formatCount} {orientation} {dots} />
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
