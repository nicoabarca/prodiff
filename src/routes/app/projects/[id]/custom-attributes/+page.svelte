<script lang="ts">
  import CustomAttributesPage from "$lib/custom-attributes/components/custom-attributes-page.svelte";
  import type { CustomAttribute } from "$lib/custom-attributes/types";
  import { customAttributeColumn } from "$lib/custom-attributes/utils/custom-attribute-id";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import {
    groups,
    groupsReadingColumn,
    isApplied,
    reapplyGroupsReading
  } from "$lib/groups/state/groups.svelte";
  import { invalidateDfg } from "$lib/dfg/state/dfg.svelte";
  import { invalidateTree } from "$lib/tree/state/build.svelte";

  const project = $derived(currentProject());
  const appliedGroupIds = $derived(groups.filter(isApplied).map((group) => group.id));

  function blockersOf(attribute: CustomAttribute) {
    return groupsReadingColumn(customAttributeColumn(attribute.id)).map(({ id, name, color }) => ({
      id,
      name,
      color
    }));
  }
</script>

{#if project}
  <CustomAttributesPage
    {project}
    {appliedGroupIds}
    {blockersOf}
    onwritten={async (attribute) => {
      await reapplyGroupsReading(project, customAttributeColumn(attribute.id));
      invalidateTree();
      invalidateDfg();
    }}
  />
{/if}
