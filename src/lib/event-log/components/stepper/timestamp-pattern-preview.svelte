<script lang="ts">
  import { parseWithFormat } from "$lib/event-log/utils/timestamp-format";
  import { cn } from "$lib/utils";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  let { values, pattern, settling }: { values: string[]; pattern: string; settling: boolean } =
    $props();

  const sample = $derived(values.filter((value) => value.trim() !== ""));
  const preview = $derived(
    sample.map((value) => {
      const result = parseWithFormat(value, pattern);
      return { value, iso: result.ok ? result.iso : null };
    })
  );
  const share = $derived(
    sample.length === 0
      ? 0
      : Math.round((preview.filter(({ iso }) => iso !== null).length / sample.length) * 100)
  );
</script>

<div class="flex min-h-0 flex-col gap-1.5">
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
      Matching preview
    </span>
    {#if settling}
      <span class="text-muted-foreground flex items-center gap-1.5 text-xs">
        <LoaderCircle class="size-3 animate-spin" aria-hidden="true" />
        Reading <span class="font-mono">{pattern}</span>
      </span>
    {/if}
  </div>
  <div
    class={cn(
      "border-border max-h-64 min-h-0 flex-1 overflow-y-auto border transition-opacity",
      settling && "opacity-50"
    )}
  >
    {#each preview as row}
      <div class="border-border/60 grid grid-cols-2 border-b last:border-b-0">
        <span class="text-muted-foreground truncate px-2 py-1 font-mono text-xs">
          {row.value}
        </span>
        <span
          class={cn(
            "truncate px-2 py-1 font-mono text-xs",
            row.iso ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          )}
        >
          {row.iso ?? "no match"}
        </span>
      </div>
    {/each}
  </div>
  <p class={cn("text-muted-foreground text-right text-xs", settling && "opacity-50")}>
    <span class="font-mono">{pattern || "No pattern"}</span> matches {share}% of
    {sample.length.toLocaleString()} sample rows
  </p>
</div>
