import { readSetting, writeSetting } from "$lib/db/app-settings";

/** Whether the first-run screen has been left behind, which happens once a Project exists. */
export const welcome = $state<{ loaded: boolean; done: boolean }>({ loaded: false, done: false });

export async function loadWelcome() {
  welcome.done = (await readSetting("welcomed")) ?? false;
  welcome.loaded = true;
}

export async function finishWelcome() {
  welcome.done = true;
  await writeSetting("welcomed", true);
}
