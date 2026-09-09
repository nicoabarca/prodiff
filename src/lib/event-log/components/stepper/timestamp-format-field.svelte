<script lang="ts">
  import type { TimestampFormats } from "$lib/event-log/state/timestamp-formats.svelte";
  import { matchedRows } from "$lib/event-log/utils/format-check";
  import { parseWithFormat } from "$lib/event-log/utils/timestamp-format";
  import { Button } from "$lib/components/ui/button/index.js";
  import Settings from "@lucide/svelte/icons/settings";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import TimestampFormatDialog from "./timestamp-format-dialog.svelte";

  let { column, formats }: { column: string; formats: TimestampFormats } = $props();

  let open = $state(false);
  const pattern = $derived(formats.patterns[column] ?? "");
  const check = $derived(formats.checks[column]);
  const share = $derived.by(() => {
    if (check?.pattern === pattern && check.rows > 0) {
      return Math.round((matchedRows(check) / check.rows) * 100);
    }
    const sample = formats.values(column).filter((value) => value.trim() !== "");
    if (!pattern || sample.length === 0) return null;
    const matched = sample.filter((value) => parseWithFormat(value, pattern).ok).length;
    return Math.round((matched / sample.length) * 100);
  });
</script>

<div class="flex shrink-0 items-center justify-end gap-1.5">
  {#if formats.isChecking(column)}
    <LoaderCircle
      class="text-muted-foreground size-4 shrink-0 animate-spin"
      aria-label="Counting the rows this format reads"
    />
  {:else if share !== null}
    <span class="text-muted-foreground text-xs whitespace-nowrap">matches {share}%</span>
  {:else}
    <span class="text-muted-foreground text-xs whitespace-nowrap">No format found</span>
  {/if}
  <Button
    variant="ghost"
    size="icon-sm"
    onclick={() => (open = true)}
    aria-label="Set the timestamp pattern for {column}"
  >
    <Settings />
  </Button>
</div>

<TimestampFormatDialog
  bind:open
  {column}
  values={formats.values(column)}
  inference={formats.inference[column]}
  {pattern}
  onApply={(value) => formats.choose(column, value)}
/>
