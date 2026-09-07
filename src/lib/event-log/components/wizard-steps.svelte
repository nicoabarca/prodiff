<script lang="ts">
  import { cn } from "$lib/utils";

  // `completed` marks a step the wizard walked past without visiting.
  let { active, completed = [] }: { active: 1 | 2 | 3 | 4; completed?: number[] } = $props();

  const steps = [
    { n: 1, label: "Upload Event Log" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Field settings" },
    { n: 4, label: "Review" }
  ] as const;

  function done(n: number): boolean {
    return n < active || completed.includes(n);
  }
</script>

<ol class="mb-6 flex items-center justify-center gap-3">
  {#each steps as step, i}
    <li class="flex items-center gap-2">
      <span
        class={cn(
          "flex size-6 shrink-0 items-center justify-center border text-xs font-bold",
          step.n === active
            ? "border-primary bg-primary text-primary-foreground"
            : done(step.n)
              ? "border-border bg-accent text-accent-foreground"
              : "border-border text-muted-foreground"
        )}
      >
        {step.n}
      </span>
      <span
        class={cn(
          "text-xs font-semibold tracking-widest uppercase",
          step.n === active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {step.label}
      </span>
    </li>
    {#if i < steps.length - 1}
      <li class="bg-border h-px w-8" aria-hidden="true"></li>
    {/if}
  {/each}
</ol>
