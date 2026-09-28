import { readSetting, writeSetting } from "$lib/db/app-settings";

/** When each Project was last opened, as ISO timestamps keyed by Project id. */
export const openedAt = $state<Record<string, string>>({});

export async function loadOpenedAt() {
  const stored = (await readSetting("projectsOpenedAt")) ?? {};
  for (const id of Object.keys(openedAt)) delete openedAt[id];
  Object.assign(openedAt, stored);
}

export async function markOpened(projectId: string) {
  openedAt[projectId] = new Date().toISOString();
  await writeSetting("projectsOpenedAt", { ...openedAt });
}

export async function forgetOpened(projectId: string) {
  if (!(projectId in openedAt)) return;
  delete openedAt[projectId];
  await writeSetting("projectsOpenedAt", { ...openedAt });
}
