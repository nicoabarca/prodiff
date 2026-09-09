<script lang="ts">
  const TOKENS: [string, string][] = [
    ["YYYY", "Four digit year"],
    ["YY", "Two digit year"],
    ["MM", "Month in year"],
    ["DD", "Day in month"],
    ["HH", "Hour, 0 to 23"],
    ["hh", "Hour, 1 to 12"],
    ["mm", "Minute in hour"],
    ["ss", "Second in minute"],
    ["SSS", "Milliseconds"],
    ["SSSSSS", "Microseconds"],
    ["A", "AM or PM"],
    ["Z", "Time zone offset, Z or +00:00"]
  ];
</script>

<div class="flex min-w-0 flex-1 flex-col gap-1.5">
  <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
    Pattern legend
  </span>
  <table class="border-border w-full border text-[0.6875rem]">
    <tbody>
      {#each TOKENS as [token, meaning]}
        <tr class="border-border/60 border-b last:border-b-0">
          <th
            scope="row"
            class="border-border/60 text-foreground w-20 border-r px-2 py-0.5 text-left font-mono font-normal"
          >
            {token}
          </th>
          <td class="text-muted-foreground px-2 py-0.5">{meaning}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
