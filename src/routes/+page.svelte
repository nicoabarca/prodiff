<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  let numbers = $state([1, 2, 3]);
  let total = $derived.by(() => {
    let total = 0;
    for (const n of numbers) {
      total += n;
    }
    return total;
  });
</script>

<Button onclick={() => numbers.push(numbers.length + 1)}>
  {numbers.join(" + ")} = {total}
</Button>
