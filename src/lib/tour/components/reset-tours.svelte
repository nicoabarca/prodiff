<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { loadToursSeen, resetToursSeen, toursSeen } from "$lib/tour/state/seen.svelte";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  $effect(() => {
    if (!toursSeen.loaded) loadToursSeen();
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Tours</Card.Title>
    <Card.Description>
      Each view of the sample project has a short tour that starts the first time you open it.
    </Card.Description>
    <Card.Action>
      <Button
        variant="outline"
        size="sm"
        disabled={toursSeen.ids.length === 0}
        onclick={resetToursSeen}
      >
        <RotateCcw data-icon="inline-start" />
        Show tours again
      </Button>
    </Card.Action>
  </Card.Header>
</Card.Root>
