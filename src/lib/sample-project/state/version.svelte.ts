import { readSetting, writeSetting } from "$lib/db/app-settings";
import { SAMPLE_VERSION } from "$lib/sample-project/manifest";

/** The version the existing Sample Project was created from, null when none was recorded. */
export const sampleVersion = $state<{ loaded: boolean; value: number | null }>({
  loaded: false,
  value: null
});

export async function loadSampleVersion() {
  sampleVersion.value = await readSetting("sampleProjectVersion");
  sampleVersion.loaded = true;
}

export async function recordSampleVersion() {
  await writeSetting("sampleProjectVersion", SAMPLE_VERSION);
  sampleVersion.value = SAMPLE_VERSION;
  sampleVersion.loaded = true;
}

/** Whether the recorded version differs from the one this build ships. Call inside a `$derived`. */
export function sampleOutdated(): boolean {
  return sampleVersion.loaded && sampleVersion.value !== SAMPLE_VERSION;
}
