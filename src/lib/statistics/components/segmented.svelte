<script lang="ts" generics="T extends string">
  let {
    value,
    options,
    onchange,
    label
  }: {
    value: T;
    options: { value: T; label: string }[];
    onchange: (value: T) => void;
    label: string;
  } = $props();
</script>

<div class="inline-flex border" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={value === option.value}
      class="h-6.5 cursor-pointer border-r px-2.5 text-[0.6875rem] last:border-r-0 {value ===
      option.value
        ? 'bg-muted text-foreground font-semibold'
        : 'bg-card text-muted-foreground hover:text-foreground font-medium'}"
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
