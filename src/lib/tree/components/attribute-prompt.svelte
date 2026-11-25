<script lang="ts">
  import { attributeOptions } from "$lib/analysis/attributes";
  import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import AttributePicker from "$lib/custom-attributes/components/attribute-picker.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { build } from "$lib/tree/state/build.svelte";
  import { saveSettings, settings } from "$lib/tree/state/tree.svelte";
  import type { Project } from "$lib/event-log/types";

  let { project }: { project: Project } = $props();

  const options = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );

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

  const count = $derived(options.filter((name) => chosen.includes(name)).length);

  async function confirm(attributes: string[]) {
    await saveSettings(project.id, {
      ...settings.value,
      attributes,
      attributesChosen: true
    });
    build(project);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="sm:max-w-[40rem]"
    showCloseButton={false}
    onInteractOutside={(event) => event.preventDefault()}
    onEscapeKeydown={(event) => event.preventDefault()}
  >
    <Dialog.Header>
      <Dialog.Title>Choose attributes to test</Dialog.Title>
      <Dialog.Description>
        The tree tests these attributes for differences between groups. You can change them later
        from Attributes tested in the toolbar.
      </Dialog.Description>
    </Dialog.Header>

    <AttributePicker
      {project}
      {options}
      selected={chosen}
      onChange={(next) => (chosen = next)}
      class="max-h-[60vh]"
    />

    <Dialog.Footer>
      <Button variant="outline" onclick={() => confirm([])}>Skip</Button>
      <Button disabled={count === 0} onclick={() => confirm(chosen)}>
        Test {count}
        {count === 1 ? "attribute" : "attributes"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
