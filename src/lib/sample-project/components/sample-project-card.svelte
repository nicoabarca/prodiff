<script lang="ts">
  import { Card } from "$lib/components/ui/card/index.js";
  import { openNewSampleProject, sampleCreation } from "$lib/sample-project/state/creation.svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Sparkles from "@lucide/svelte/icons/sparkles";

  let { update = false }: { update?: boolean } = $props();

  const label = $derived(update ? "Update the sample project" : "Try the sample project");
</script>

<li>
  <button
    type="button"
    onclick={openNewSampleProject}
    disabled={sampleCreation.running}
    class="h-full w-full cursor-pointer text-left disabled:cursor-wait"
    aria-label={label}
  >
    <Card
      class="border-border hover:border-primary hover:shadow-primary/25 text-muted-foreground hover:text-primary flex h-full min-h-64 flex-col items-center justify-center gap-2 border border-dashed bg-transparent px-8 text-center shadow-none ring-0 transition-all hover:shadow-lg"
    >
      <span class="flex items-center gap-2">
        {#if sampleCreation.running}
          <LoaderCircle class="size-4 shrink-0 animate-spin" aria-hidden="true" />
        {:else if update}
          <RefreshCw class="size-4 shrink-0" aria-hidden="true" />
        {:else}
          <Sparkles class="size-4 shrink-0" aria-hidden="true" />
        {/if}
        <span class="font-heading text-sm font-semibold tracking-tight">
          {sampleCreation.running ? "Creating sample project…" : label}
        </span>
      </span>
      <span class="text-xs">
        {update
          ? "A newer sample ships with this version. Updating replaces your sample project and its Groups."
          : "Loan applications with Groups ready to compare."}
      </span>
    </Card>
  </button>
</li>
