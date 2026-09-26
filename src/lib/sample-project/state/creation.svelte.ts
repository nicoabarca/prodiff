import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";
import { createSampleProject } from "$lib/sample-project/utils/create";

/** Whether the Sample Project is being created. Every entry point shares it. */
export const sampleCreation = $state<{ running: boolean }>({ running: false });

/** Creates the Sample Project and opens it. A failure is reported as a toast. */
export async function openNewSampleProject() {
  if (sampleCreation.running) return;
  sampleCreation.running = true;
  try {
    const project = await createSampleProject();
    await goto(`/app/projects/${project.id}`);
  } catch (error) {
    toast.error("Couldn't create the sample project", { description: String(error) });
  } finally {
    sampleCreation.running = false;
  }
}
