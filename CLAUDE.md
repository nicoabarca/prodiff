# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Tauri v2 desktop app with a SvelteKit (Svelte 5, runes) frontend, Tailwind CSS v4, and shadcn-svelte components. Package manager is pnpm (see `pnpm-lock.yaml`).

## Commands

- `pnpm dev` — start the Vite dev server (frontend only, port 1420, fixed via `vite.config.js`).
- `pnpm tauri dev` — run the full desktop app (spawns the frontend dev server via `beforeDevCommand` in `src-tauri/tauri.conf.json`, then opens the native window).
- `pnpm build` — build the frontend (`vite build`); `pnpm tauri build` builds the full desktop bundle.
- `pnpm check` — type-check via `svelte-kit sync && svelte-check`. Run this after any change; there is no separate lint/test script.
- `pnpm check:watch` — same, in watch mode.
- Adding/updating shadcn-svelte components: `npx shadcn-svelte@latest add <name>` (see `components.json` for config: style `lyra`, base color `neutral`, icon library `lucide`). Never hand-edit files under `src/lib/components/ui/` — treat them as generated; re-run `add`/`update` instead.

## Architecture

**SPA mode, not SSR.** `src/routes/+layout.ts` sets `export const ssr = false` and `svelte.config.js` uses `@sveltejs/adapter-static` with `fallback: "index.html"` — Tauri has no Node server, so the whole app is client-rendered and all routing happens in the browser after load.

**Route structure** (`src/routes/`):

- `/` — the welcome/landing screen, outside the app shell (no sidebar).
- `/app/+layout.svelte` — the app shell: wraps every `/app/*` route in `Sidebar.Provider` + the custom `AppSidebar` (`src/lib/components/layout/sidebar.svelte`) + `Sidebar.Inset`. It derives `activeProject` reactively from `page.params.id`, so any nested route with a `[id]` param automatically gets the project-scoped sidebar section.
- `/app/projects` — dashboard (grid of `ProjectCard`s).
- `/app/projects/new` — file-upload mock step.
- `/app/projects/new/mapping` — column-mapping step (reads/clears the pending upload from the shared state module, then calls `addProject` and navigates to the new project).
- `/app/projects/[id]` — per-project view; currently a placeholder (`ViewPlaceholder`) since deeper views (process map, variants, statistics, data table) aren't built yet.
- `/app/settings` — placeholder.

**Cross-route state** lives in `src/lib/state/projects.svelte.ts` as module-level `$state` (Svelte 5 runes), not a store or context. `projects` (the list) and `draftUpload` (the in-progress upload/mapping flow) are exported directly and mutated by whichever route needs them — this is how state survives navigating between `/app/projects/new` and `/app/projects/new/mapping` without prop-drilling or URL params. `src/lib/types.ts` holds the `Project` type and mock seed data.

**Component split** — three tiers under `src/lib/components/`:

- `ui/` — shadcn-svelte primitives only, CLI-managed, never hand-edit (see Commands above).
- `layout/` — app-chrome components (sidebar, topbar, view-placeholder) composed from `ui/` primitives.
- `projects/` — feature-specific components (e.g. the project card).

Styling convention: Tailwind utility classes directly on elements/component `class` props — no scoped `<style>` blocks with `@apply` in routes or components. Use `rem`/`em` for custom sizing, never `px`. Icons come from `@lucide/svelte`; when placed inside a shadcn `Button`, use `data-icon="inline-start"`/`"inline-end"` (the button component handles icon sizing/spacing itself — don't add manual size classes there).

`src/lib/utils.ts` exports the shadcn-standard `cn()` helper (clsx + tailwind-merge) plus a few `WithElementRef`-style type helpers used by the `ui/` components.
