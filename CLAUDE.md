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
├── slices/            Slice records, chains, populations, impact cache
├── statistics/        comparison charts, metrics table, event data table
├── tree/              directed tree, variants, canvas, node detail
└── distributions/     per-node attribute distributions

each domain: types.ts · invokers/ · state/ · utils/ · components/ · tests/
```

Dependencies run one way — `statistics | tree | distributions → slices → filters → event-log` — plus `distributions → tree`. Nothing points back up.

**Where new code goes:**

- A component used by one feature goes in that domain's `components/`. Only put it in `src/lib/components/` if two unrelated features use it.
- A new Tauri command gets one file in `<domain>/invokers/`, named after the command (`invoke("directed_tree", …)` → `tree/invokers/directed-tree.ts`). Components call the invoker, never `invoke()` directly.
- A type Rust serializes goes in `<domain>/invokers/types.ts`; everything else in `<domain>/types.ts`, including shapes persisted to SQLite that never cross `invoke`. Never re-declare a type in a second file — import it, following the direction above.
- Types at a call boundary carry a direction prefix: `Response*` for what an invoker returns (`ResponseDirectedTree`), `Request*` for what it sends (`RequestColumnMapping`). Types nested inside those stay unprefixed (`TreeNode`, `Test`, `Summary`) — the prefix marks what an invoker hands over directly, not everything bound to a serde struct.
- A new filter kind is one file in `filters/filters/` (type, modes, copy, its `describe`/`isComplete` arms) plus two lines in `filters/filters/filter.ts`. Mirrors `src-tauri/src/filters/`.
- Tests go in `<domain>/tests/{components,state,invokers,utils}/`. Shared components keep their test beside their source. A test using runes must have `.svelte` in its filename (`slices.svelte.test.ts`) or Vitest will not compile them.

**Conventions:** kebab-case filenames and folders throughout. Deep imports, no barrel files — `import type { Slice } from "$lib/slices/types"`, not from a domain index. Prefer the `$lib` alias over relative paths.

**Routes stay thin.** `src/routes/` handles URL structure and page composition. Four routes are still fat (`distributions`, `new`, `filters`, `tree`) and are a known deferred cleanup — don't add to them.

**Slices and their two measurement caches:** a slice's effective chain is the Base chain followed by its own (`effectiveChain`), and results are cached two ways: `impacts` (per-slice `{key, steps}`, in memory, filled by the Filters view via `loadImpact`, read with `sliceSteps`/`sliceCases`) and the persisted `stats`/`statsKey` columns filled by the Statistics view via `computeStats`. Both are keyed by `chainKey(effectiveChain(slice))` — anything showing a case count must compare that key before displaying, or an edited chain leaves the previous numbers on screen (see `slices/components/filter-summary-bar.svelte`, which prefers the live `sliceCases` and falls back to keyed `stats`).

Styling convention: Tailwind utility classes directly on elements/component `class` props — no scoped `<style>` blocks with `@apply` in routes or components. Use `rem`/`em` for custom sizing, never `px`. Icons come from `@lucide/svelte`; when placed inside a shadcn `Button`, use `data-icon="inline-start"`/`"inline-end"` (the button component handles icon sizing/spacing itself — don't add manual size classes there).
