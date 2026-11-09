<script lang="ts" generics="T extends string">
  let {
    value,
    options,
    onchange,
    label
  }: {
    value: T;
    options: { value: T; label: string; dot?: string; disabled?: boolean; title?: string }[];
    onchange: (value: T) => void;
    label: string;
  } = $props();
</script>

<div class="inline-flex w-fit max-w-full border" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={value === option.value}
      disabled={option.disabled}
      title={option.title}
      class="flex h-6.5 min-w-0 cursor-pointer items-center gap-1.25 border-r px-2.5 text-[0.6875rem] last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50 {value ===
      option.value
        ? 'bg-muted text-foreground font-semibold'
        : 'bg-card text-muted-foreground hover:text-foreground font-medium'}"
      onclick={() => onchange(option.value)}
    >
      {#if option.dot}
        <span class="size-1.75 shrink-0 rounded-full" style="background:{option.dot}"></span>
      {/if}
      <span class="truncate">{option.label}</span>
    </button>
  {/each}
</div>
