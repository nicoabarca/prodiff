<script lang="ts">
  import { attributeOptions } from "$lib/analysis/attributes";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { build } from "$lib/tree/state/build.svelte";
  import { saveSettings, settings } from "$lib/tree/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";

  let { project }: { project: Project } = $props();

  const options = $derived(attributeOptions(project.columns, project.hiddenColumns));

  let open = $state(false);
  let promptedProjectId = $state<string | null>(null);
  let chosen = $state<string[]>([]);

  $effect(() => {
    if (settings.projectId !== project.id || settings.value.attributesChosen) {
      open = false;
      return;
    }
    if (promptedProjectId !== project.id) {
      promptedProjectId = project.id;
      chosen = [];
    }
    open = true;
  });

  function toggle(attribute: string, checked: boolean) {
    chosen = checked ? [...chosen, attribute] : chosen.filter((name) => name !== attribute);
  }

  function granularity(attribute: string) {
    return project.columns.find((column) => column.name === attribute)?.scope === "case"
      ? "case"
      : "event";
  }

  async function confirm() {
    await saveSettings(project.id, {
      ...settings.value,
      attributes: chosen,
      attributesChosen: true
    });
    build(project);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="sm:max-w-lg"
    showCloseButton={false}
    onInteractOutside={(event) => event.preventDefault()}
    onEscapeKeydown={(event) => event.preventDefault()}
  >
    <Dialog.Header>
      <Dialog.Title>Choose attributes to test</Dialog.Title>
      <Dialog.Description>
        These attributes are tested for differences between groups in the tree. You can change this
        later in Build settings.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-2">
      {#each options as attribute (attribute)}
        <label class="flex items-center gap-2 text-xs">
          <Checkbox
            checked={chosen.includes(attribute)}
            onCheckedChange={(checked) => toggle(attribute, checked === true)}
          />
          <span>
            {attribute}
            <span class="text-muted-foreground">({granularity(attribute)})</span>
          </span>
        </label>
      {:else}
        <p class="text-muted-foreground text-xs">
          This project has no attribute columns beyond the required fields.
        </p>
      {/each}
    </div>

    <Dialog.Footer>
      <Button onclick={confirm}>Confirm</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
