<script lang="ts">
  import {
    attributeLabel,
    isCustomAttribute
  } from "$lib/custom-attributes/state/custom-attributes.svelte";

  /** An attribute as the user reads it: a Custom Attribute shows its name behind an ƒx marker. */
  let { name }: { name: string } = $props();
</script>

{#if isCustomAttribute(name)}<span
    class="text-primary mr-1 font-mono text-[0.9em] font-bold normal-case"
    aria-label="Custom attribute:">ƒx</span
  >{/if}{attributeLabel(name)}
