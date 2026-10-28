<script lang="ts">
  /** Stands in for a comparison view whose two Groups cannot be compared. */
  import * as Empty from "$lib/components/ui/empty/index.js";
  import type { Project } from "$lib/event-log/types";
  import CompareField from "$lib/groups/components/compare-field.svelte";
  import { comparedGroups, relation } from "$lib/groups/state/comparison.svelte";
  import { refusalCopy } from "$lib/groups/utils/comparison-note";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";

  let { project }: { project: Project } = $props();

  const reason = $derived(
    relation.summary
      ? refusalCopy(comparedGroups(), relation.summary)
      : (relation.error ?? "These groups cannot be compared.")
  );
</script>

<div class="bg-sidebar flex min-h-0 flex-1 items-center justify-center p-6">
  <Empty.Root>
    <Empty.Header>
      <Empty.Media variant="icon">
        <CircleSlash />
      </Empty.Media>
      <Empty.Title>Nothing to compare</Empty.Title>
      <Empty.Description>{reason}</Empty.Description>
    </Empty.Header>
    <CompareField {project} class="border" />
  </Empty.Root>
</div>
