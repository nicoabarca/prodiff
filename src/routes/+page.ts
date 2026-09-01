import { redirect } from "@sveltejs/kit";

// Nothing lives at the root: the app opens on the project list.
export function load() {
  redirect(307, "/app/projects");
}
