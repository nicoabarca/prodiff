<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { openNewSampleProject, sampleCreation } from "$lib/sample-project/state/creation.svelte";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Sparkles from "@lucide/svelte/icons/sparkles";

  let { update = false }: { update?: boolean } = $props();

  const label = $derived(update ? "Update the sample project" : "Try the sample project");
  const description = $derived(
    update
      ? "A newer sample ships with this version. Updating replaces your sample project and its Groups."
      : "Loan applications with Groups ready to compare, and a tour of each view."
  );
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        aria-label={label}
        disabled={sampleCreation.running}
        onclick={openNewSampleProject}
      >
        {#if sampleCreation.running}
          <LoaderCircle data-icon="inline-start" class="animate-spin" />
        {:else if update}
          <RefreshCw data-icon="inline-start" />
        {:else}
          <Sparkles data-icon="inline-start" />
        {/if}
        {sampleCreation.running ? "Creating sample project…" : label}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="max-w-64">{description}</Tooltip.Content>
</Tooltip.Root>
