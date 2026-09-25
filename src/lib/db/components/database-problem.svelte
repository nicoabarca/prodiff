<script lang="ts">
  import * as Empty from "$lib/components/ui/empty/index.js";
  import DatabaseZap from "@lucide/svelte/icons/database-zap";
  import type { DbProblem } from "$lib/db/types";

  let { problem }: { problem: DbProblem } = $props();

  const title = $derived(
    problem.kind === "newer"
      ? "This data needs a newer ProDiff"
      : problem.kind === "migration"
        ? "ProDiff couldn't update your data"
        : "ProDiff couldn't open your data"
  );
</script>

<div class="flex h-screen items-center justify-center p-6">
  <Empty.Root class="max-w-lg border-0">
    <Empty.Header>
      <Empty.Media variant="icon"><DatabaseZap /></Empty.Media>
      <Empty.Title class="font-heading">{title}</Empty.Title>
      <Empty.Description>
        {#if problem.kind === "newer"}
          It was saved by a newer version of ProDiff. Install the latest version to open it.
        {:else if problem.kind === "migration" && problem.backupPath}
          Your data was left as it was before the update, and a copy of it is saved at
          <code class="break-all">{problem.backupPath}</code>.
        {:else}
          Your data was left as it was. Restart ProDiff to try again.
        {/if}
      </Empty.Description>
    </Empty.Header>
    {#if problem.kind !== "newer"}
      <Empty.Content>
        <code class="text-muted-foreground text-xs break-all">{problem.message}</code>
      </Empty.Content>
    {/if}
  </Empty.Root>
</div>
