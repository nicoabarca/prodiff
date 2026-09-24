import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "svelte-sonner";

/**
 * Asks GitHub for a newer release and, when there is one, offers to install it.
 * A failed check stays silent: the app works offline and before the first release.
 */
export async function offerUpdate(): Promise<void> {
  const update = await check().catch(() => null);
  if (!update) return;
  toast(`ProDiff ${update.version} is available`, {
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Install and restart", onClick: () => install(update) },
    cancel: { label: "Later", onClick: () => {} }
  });
}

async function install(update: Update): Promise<void> {
  const id = toast.loading(`Downloading ProDiff ${update.version}`);
  let total = 0;
  let received = 0;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress" && total > 0) {
        received += event.data.chunkLength;
        const percent = Math.min(100, Math.round((received / total) * 100));
        toast.loading(`Downloading ProDiff ${update.version} (${percent}%)`, { id });
      }
    });
    await relaunch();
  } catch (error) {
    toast.error("The update could not be installed", { id, description: String(error) });
  }
}
