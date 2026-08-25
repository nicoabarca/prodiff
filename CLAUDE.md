# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — start the Vite dev server (frontend only, port 1420, fixed via `vite.config.js`).
- `pnpm tauri dev` — run the full desktop app (spawns the frontend dev server via `beforeDevCommand` in `src-tauri/tauri.conf.json`, then opens the native window).
- `pnpm build` — build the frontend (`vite build`); `pnpm tauri build` builds the full desktop bundle.
- `pnpm check` — type-check via `svelte-kit sync && svelte-check`. Run this after any change.
- `pnpm test` — run Vitest once; `pnpm test:watch` for watch mode. Config lives in `vitest.config.ts`, deliberately separate from the Tauri-tuned `vite.config.js`.
- Adding/updating shadcn-svelte components: `npx shadcn-svelte@latest add <name>` (see `components.json` for config: style `lyra`, base color `neutral`, icon library `lucide`). Never hand-edit files under `src/lib/components/ui/` — treat them as generated; re-run `add`/`update` instead.

## Architecture

**SPA mode, not SSR.** `src/routes/+layout.ts` sets `export const ssr = false` and `svelte.config.js` uses `@sveltejs/adapter-static` with `fallback: "index.html"` — Tauri has no Node server, so the whole app is client-rendered and all routing happens in the browser after load.

**Organized by domain, not by kind of file** (see `docs/adr/0004`). Six domains under `src/lib/`, each owning its own components, state, Tauri invokers, invocation contracts, utilities and tests:

```
src/lib/
├── components/        genuinely shared only
│   ├── ui/            shadcn primitives, CLI-managed, never hand-edited
│   ├── layout/        sidebar, topbar, view-placeholder
│   └── virtual-list/  own reusable component + its logic + its test
├── db/                client.ts, schema.ts (one file, all tables)
├── hooks/             shadcn
├── format.ts          global: 21 importers, no domain knowledge
├── utils.ts           shadcn `cn()`
├── event-log/         Project record, column mapping, upload wizard
├── filters/           filter vocabulary (one module per kind) + editor
├── groups/            Group records, Filter Lists, palette, impact cache
├── statistics/        comparison charts, metrics table, event data table
├── tree/              directed tree, variants, canvas, node detail
└── distributions/     per-node attribute distributions

each domain: types.ts · invokers/ · state/ · utils/ · components/ · tests/
```

Dependencies run one way — `statistics | tree | distributions → groups → filters → event-log` — plus `distributions → tree`. Nothing points back up.

**Where new code goes:**

- A component used by one feature goes in that domain's `components/`. Only put it in `src/lib/components/` if two unrelated features use it.
- A new Tauri command gets one file in `<domain>/invokers/`, named after the command (`invoke("directed_tree", …)` → `tree/invokers/directed-tree.ts`). Components call the invoker, never `invoke()` directly.
- A type Rust serializes goes in `<domain>/invokers/types.ts`; everything else in `<domain>/types.ts`, including shapes persisted to SQLite that never cross `invoke`. Never re-declare a type in a second file — import it, following the direction above.
- Types at a call boundary carry a direction prefix: `Response*` for what an invoker returns (`ResponseDirectedTree`), `Request*` for what it sends (`RequestColumnMapping`). Types nested inside those stay unprefixed (`TreeNode`, `Test`, `Summary`) — the prefix marks what an invoker hands over directly, not everything bound to a serde struct.
- A new filter kind is one file in `filters/kind/` (type, modes, copy, its `describe`/`isComplete` arms) plus two lines in `filters/kind/filter.ts`, and one file in `filters/components/editors/` plus one `{:else if}` in `filter-editor.svelte`. Mirrors `src-tauri/src/filters/`.
- `case_not_in_group` is the one filter that reads something other than the log. Its excluded case ids are resolved in `queries::filtered` before the pipeline runs and handed to `filters::apply` as `ExcludedCases`; a Group that has never been applied contributes nothing. It also makes Groups a dependency graph — scanned out of Filter Lists by `dependentsOf`, never stored — and deleting a Group cascades to everything that excludes it.
- Tests go in `<domain>/tests/{components,state,invokers,utils}/`. Shared components keep their test beside their source. A test using runes must have `.svelte` in its filename (`slices.svelte.test.ts`) or Vitest will not compile them.

**Conventions:** kebab-case filenames and folders throughout. Deep imports, no barrel files — `import type { Slice } from "$lib/slices/types"`, not from a domain index. Prefer the `$lib` alias over relative paths.

**Routes stay thin.** `src/routes/` handles URL structure and page composition. Four routes are still fat (`distributions`, `new`, `filters`, `tree`) and are a known deferred cleanup — don't add to them.

**Groups are materialized.** A Group is a Filter List applied to the Event Log and written to `{app_data}/projects/{project_id}/groups/{group_id}.parquet` (see `docs/adr/0005`). The Filter List stays the source of truth; the Parquet is its product. `apply_group` writes the file and returns the Group's figures in the same pass, so `stats` non-null means "this Group has a Parquet" and null means "not applied yet" — there is no separate key column to compare. The row is written before the file and deleted after it, so a file without a row is unreachable; `loadGroups` checks the file still exists and drops the cached figures when it does not. Group ids are eight random base62 characters and are never reused, because a copied Filter List can carry `case_not_in_group(id)`.

**Editing is a draft until Apply.** `groups/state/drafts.svelte.ts` holds unapplied Filter Lists in memory, keyed by Group id; `draftOf` falls back to the applied list, `isDirty` compares the two by `filtersKey`. Add, replace, remove, reorder and clear are all one array operation on that draft — reordering included, which is a real edit because `keep_selected`/`trim` change what the filters after them see. Apply is the only write.

`impacts` (per-Group `{key, steps}`, in memory, filled by the Filters view via `loadImpact`, read with `groupSteps`/`groupCases`) is the draft preview only. It writes nothing and its numbers belong to the draft, not to the Group — anything showing them must label them as the draft's.

The Original is not a row: it is the whole Event Log, synthesized by `originalGroup()`, answering to the id `original` everywhere including in Rust.

Styling convention: Tailwind utility classes directly on elements/component `class` props — no scoped `<style>` blocks with `@apply` in routes or components. Use `rem`/`em` for custom sizing, never `px`. Icons come from `@lucide/svelte`; when placed inside a shadcn `Button`, use `data-icon="inline-start"`/`"inline-end"` (the button component handles icon sizing/spacing itself — don't add manual size classes there).
