<script lang="ts">
  let { active }: { active: 1 | 2 } = $props();

  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map & confirm" }
  ] as const;
</script>

<ol class="mb-6 flex items-center gap-3">
  {#each steps as step, i}
    <li class="flex items-center gap-2">
      <span
        class={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold ${
          step.n === active
            ? "border-primary bg-primary text-primary-foreground"
            : step.n < active
              ? "border-border bg-accent text-accent-foreground"
              : "border-border text-muted-foreground"
        }`}
      >
        {step.n}
      </span>
      <span
        class={`text-xs font-semibold tracking-widest uppercase ${
          step.n === active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {step.label}
      </span>
    </li>
    {#if i < steps.length - 1}
      <li class="bg-border h-px w-8" aria-hidden="true"></li>
    {/if}
  {/each}
</ol>
