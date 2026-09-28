<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import type { BinaryOperator } from "$lib/custom-attributes/invokers/types";
  import type { Block } from "$lib/custom-attributes/utils/blocks";

  let {
    columns,
    oninsert,
    onparentheses
  }: {
    columns: string[];
    oninsert: (blocks: Block[]) => void;
    onparentheses: () => void;
  } = $props();

  const OPERATORS: { op: BinaryOperator; label: string; name: string }[] = [
    { op: "+", label: "+", name: "Add" },
    { op: "-", label: "−", name: "Subtract" },
    { op: "*", label: "×", name: "Multiply" },
    { op: "/", label: "÷", name: "Divide" }
  ];

  let numbering = $state(false);
  let number = $state("");
  const numberValue = $derived(/^[0-9]+(\.[0-9]+)?$/.test(number.trim()) ? Number(number) : null);

  function addNumber() {
    if (numberValue === null) return;
    oninsert([{ kind: "number", value: numberValue }]);
    number = "";
    numbering = false;
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-col gap-1.5">
    <span class="text-muted-foreground text-xs font-medium">Columns</span>
    {#if columns.length === 0}
      <p class="text-muted-foreground text-xs">The event log has no visible number columns.</p>
    {:else}
      <div class="flex flex-wrap gap-1">
        {#each columns as name (name)}
          <Button
            variant="outline"
            size="sm"
            class="text-primary h-7 px-2 text-xs"
            onclick={() => oninsert([{ kind: "column", name }])}
          >
            <span class="text-muted-foreground" aria-hidden="true">#</span>
            {name}
          </Button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <span class="text-muted-foreground text-xs font-medium">Operators</span>
    <div class="flex flex-wrap items-center gap-1">
      {#each OPERATORS as operator (operator.op)}
        <Button
          variant="outline"
          size="sm"
          class="h-7 w-8 px-0 font-bold"
          aria-label={operator.name}
          onclick={() => oninsert([{ kind: "operator", op: operator.op }])}
        >
          {operator.label}
        </Button>
      {/each}
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2 font-bold"
        aria-label="Parentheses"
        onclick={onparentheses}
      >
        ( )
      </Button>
      {#if numbering}
        <form
          class="flex items-center gap-1"
          onsubmit={(event) => {
            event.preventDefault();
            addNumber();
          }}
        >
          <Input
            bind:value={number}
            inputmode="decimal"
            placeholder="2.5"
            aria-label="Number"
            class="h-7 w-20 font-mono text-xs"
            autofocus
          />
          <Button type="submit" size="sm" class="h-7 px-2 text-xs" disabled={numberValue === null}>
            Insert
          </Button>
        </form>
      {:else}
        <Button
          variant="outline"
          size="sm"
          class="h-7 px-2 font-mono text-xs"
          onclick={() => (numbering = true)}
        >
          123
        </Button>
      {/if}
    </div>
  </div>
</div>
