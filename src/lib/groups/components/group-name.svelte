<script lang="ts">
  import { colorVar } from "$lib/format";
  import type { Group } from "$lib/groups/types";

  let { group, class: className = "" }: { group: Group; class?: string } = $props();
</script>

<span class="inline-flex max-w-full min-w-0 items-center gap-1.5 align-baseline {className}"
  ><span class="size-2 shrink-0" style="background:{colorVar(group.color)}" aria-hidden="true"
  ></span><span class="truncate">{group.name}</span></span
>
