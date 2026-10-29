<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import GranularityIcon from "$lib/custom-attributes/components/granularity-icon.svelte";
  import type { ColumnScope } from "$lib/event-log/invokers/types";
  import type { BinaryOperator } from "$lib/custom-attributes/invokers/types";
  import type { Block } from "$lib/custom-attributes/utils/blocks";
  import { isAggregate, type FunctionName } from "$lib/custom-attributes/utils/parser";

  /**
   * `columns` are the ones the caret's position may read: a function's argument
   * when `insideCall`, a direct operand otherwise. `functions` is empty where
   * the scope allows none.
   */
  let {
    columns,
    columnScope,
    insideCall = false,
    functions = [],
    oninsert,
    oncall,
    onparentheses
  }: {
    columns: string[];
    columnScope: ColumnScope;
    insideCall?: boolean;
    functions?: readonly FunctionName[];
    oninsert: (blocks: Block[]) => void;
    oncall: (fn: FunctionName) => void;
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
    <span class="text-muted-foreground text-xs font-medium">
      {insideCall
        ? "Event columns for this function"
        : columnScope === "case"
          ? "Case columns"
          : "Event columns"}
    </span>
    {#if columns.length === 0}
      <p class="text-muted-foreground text-xs">
        The event log has no visible number columns {insideCall
          ? "at event granularity"
          : "this granularity can read"}.
      </p>
    {:else}
      <div class="flex flex-wrap gap-1">
        {#each columns as name (name)}
          <Button
            variant="outline"
            size="sm"
            class="text-primary h-7 px-2 text-xs"
            title="{columnScope === 'case' ? 'Case' : 'Event'} column"
            onclick={() => oninsert([{ kind: "column", name }])}
          >
            <GranularityIcon scope={columnScope} class="text-muted-foreground" />
            {name}
          </Button>
        {/each}
      </div>
    {/if}
  </div>

  {#if functions.length > 0}
    <div class="flex flex-col gap-1.5">
      <span class="text-muted-foreground text-xs font-medium">Functions</span>
      <div class="flex flex-wrap gap-1">
        {#each functions as fn (fn)}
          <Button
            variant="outline"
            size="sm"
            class="h-7 px-2 font-mono text-xs"
            onclick={() => oncall(fn)}
          >
            {fn}({isAggregate(fn) ? "[ ]" : ""})
          </Button>
        {/each}
      </div>
    </div>
  {/if}

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
