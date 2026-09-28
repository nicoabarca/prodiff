/**
 * How far the app has got opening: the database, its pending migrations, then
 * the Projects. `migrations` counts only the migrations this launch runs.
 */
export const boot = $state<{
  stage: "opening" | "migrating" | "loading" | "ready";
  migrations: { done: number; pending: number };
}>({
  stage: "opening",
  migrations: { done: 0, pending: 0 }
});
