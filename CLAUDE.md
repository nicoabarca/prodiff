# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read before working there

Each of these holds what its directory needs and nothing else does. Read it before changing code under that directory.

- `src-tauri/CLAUDE.md` — the Rust backend: what each module holds, and which `commands.rs` a frontend invoker reaches.
- `src/lib/CLAUDE.md` — the frontend: materialized Groups, drafts and Apply, adding a filter kind, `case_not_in_group`, `tree_settings`, the toolbar and Variants panel the tree and the DFG share, the DFG split, migrations and `pnpm db:generate`.
- `scripts/CLAUDE.md` — the seed manifest format, `dev:port`, `sample:generate`, `release`.
- `e2e/CLAUDE.md` — e2e binaries, their identifier and data, narrowing a run.

The domain vocabulary — Project, Event Log, Column Mapping, Filter, Filter List, Group, Original — is defined in `CONTEXT.md`, including the words to avoid for each. Use those terms verbatim in code, comments and user-facing copy.

## Commands

- `pnpm dev` — start the Vite dev server (frontend only, port 1420, fixed via `vite.config.js`).
- `pnpm tauri dev` — run the full desktop app (spawns the frontend dev server via `beforeDevCommand` in `src-tauri/tauri.conf.json`, then opens the native window).
- `pnpm dev:port <port>` — same, on another port, with app data of its own per git branch.
- `pnpm seed [slug…]` — create or reset dev Projects from `scripts/seed_log/` in the current branch's app data.
- `pnpm build` — build the frontend (`vite build`); `pnpm tauri build` builds the full desktop bundle. `tauri.conf.json` carries the dev identifier `com.nicoabarca.prodiff.dev`; a release build adds `--config src-tauri/tauri.release.conf.json` for `com.nicoabarca.prodiff`.
- `pnpm check` — type-check via `svelte-kit sync && svelte-check`, then `tsc -p tsconfig.scripts.json` for `scripts/` and `tsc -p e2e/tsconfig.json` for the e2e suite. Both sit outside the SvelteKit-generated `include` and are where Node built-ins appear. Run this after any change. `tsconfig.json` excludes `**/*.test.ts`, so it does not type-check test files: a fixture built from a type that has since changed passes `check` and fails only under `pnpm test`. Run both.
- `pnpm test` — run Vitest once; `pnpm test:watch` for watch mode. Config lives in `vitest.config.ts`, deliberately separate from the Tauri-tuned `vite.config.js`.
- `pnpm e2e` — run the WebdriverIO specs against the debug e2e binary. It never notices a stale binary: run `pnpm e2e:build` after changing Rust or frontend code.
- In dev, `⌘⇧K` (Ctrl+Shift+K) toggles the element picker (`src/lib/devtools/picker/`): select elements in the running app and Ask about them or tell a Claude Code session to change them; the conversation stays in that session. Messages carry each element's Svelte source location, component chain and markup.
- Adding/updating shadcn-svelte components: `npx shadcn-svelte@latest add <name>` (see `components.json` for config: style `lyra`, base color `neutral`, icon library `lucide`). Never hand-edit files under `src/lib/components/ui/` — treat them as generated; re-run `add`/`update` instead.

## Architecture

**SPA mode, not SSR.** `src/routes/+layout.ts` sets `export const ssr = false` and `svelte.config.js` uses `@sveltejs/adapter-static` with `fallback: "index.html"` — Tauri has no Node server, so the whole app is client-rendered and all routing happens in the browser after load.

**Organized by domain, not by kind of file** (see `docs/adr/0004`). Each folder under `src/lib/` is a domain owning its own `types.ts · invokers/ · state/ · utils/ · components/ · tests/`. `src/lib/components/` is the exception: it holds only what two unrelated domains share, with `ui/` the shadcn primitives. `src-tauri/src/` is laid out by the same domains.

Dependencies run one way — `statistics | tree | dfg | distributions → groups → filters → event-log` — plus `distributions | dfg → tree` and `sample-project → tree | groups`. Nothing points back up. `analysis` sits below all of them and depends on nothing: it holds the payload types more than one comparison view ships, and its Rust counterpart `src-tauri/src/analysis/` holds the same types plus `read_groups` and the Significance Test machinery.

`home` sits above `event-log`, `filters`, `groups` and `sample-project`, and only the Projects route imports it.

`tour` sits above every domain (see `docs/adr/0013`). It may import any of them; only the `[id]` layout and the Settings page import it. A step points at an element through a `data-tour` attribute, plus `data-tour-key` when the element repeats, written as a plain string in the component. Never select a Tour target by class or text, and keep the attribute when moving the element.

`devtools` is dev-only (see `docs/adr/0009`). It may import from any domain; nothing imports it statically. Prod code reaches it only through a seam of the form `{#if import.meta.env.DEV}{#await import("$lib/devtools/…")}`, which Vite drops from `vite build` along with the chunk. A dev tool reads the state its view already holds and never adds props, callbacks or branches to prod components.

**Where new code goes:**

- A component used by one feature goes in that domain's `components/`. Only put it in `src/lib/components/` if two unrelated features use it.
- A new Tauri command gets one file in `<domain>/invokers/`, named after the command (`invoke("directed_tree", …)` → `tree/invokers/directed-tree.ts`). Components call the invoker, never `invoke()` directly.
- The read commands take **Group ids, not Filter Lists** — `directed_tree`, `dfg`, `list_variants`, `node_distributions`, `group_stats` and `shared_cases` resolve an id to its Parquet themselves, and `original` is the whole Event Log.
- A type Rust serializes goes in `<domain>/invokers/types.ts`; everything else in `<domain>/types.ts`, including shapes persisted to SQLite that never cross `invoke`. Never re-declare a type in a second file — import it, following the direction above.
- Types at a call boundary carry a direction prefix: `Response*` for what an invoker returns (`ResponseDirectedTree`), `Request*` for what it sends (`RequestColumnMapping`). Types nested inside those stay unprefixed (`TreeNode`, `Test`, `Summary`) — the prefix marks what an invoker hands over directly, not everything bound to a serde struct.
- **Payloads are keyed by Group id, never by A/B.** `ResponseDirectedTree.groups` and `ResponseNodeDistributions.groups` are ordered arrays carrying both order and identity (`[{ id, ... }]`); everything below them is a map keyed by id — `TreeNode.cases`, `AttributeBlock.summaries`, `CategoryCount.counts`, `Distribution.counts`/`n`/`totals`, `DurationShape.ecdf`/`boxStats`/`logCounts`. `Test.higher` names the Group that ranks higher by id, `null` for chi². Ids only: Rust never learns a Group's name or colour, so a rename cannot go stale inside a cached tree, and the views join back through `comparedGroups()`. Two casings appear in one payload and neither is wrong — serde fields are camelCase, while attribute names and attribute values are the user's own column headers and cell values, verbatim.
- **Props and arguments are keyed by Group id too.** A component takes the ordered `groups` and reads its data by `group.id`; it never takes `groupA`/`groupB`, a `nameA`/`COLOR_B` pair, or a row shaped `{ a, b }`. `Bar.counts` and `CurveRow.shares` are maps keyed by id; `SummaryCompare` takes `summaries` keyed by id; `comparedGroups()` returns `Group[]`. On the Rust side the pipeline takes `&[GroupLog]`, id and DataFrame together, and `by_group`/`keyed` are the only places the positional internals meet the ids.
- Tests go in `<domain>/tests/{components,state,invokers,utils}/`. Shared components keep their test beside their source. A test using runes must have `.svelte` in its filename (`drafts.svelte.test.ts`) or Vitest will not compile them.

**Conventions:** kebab-case filenames and folders throughout. Deep imports, no barrel files — `import type { Group } from "$lib/groups/types"`, not from a domain index. Prefer the `$lib` alias over relative paths.

**Comments document, they don't argue.** A comment says what a thing is, the units and contracts it carries, or a behavior surprising enough to trip the next reader (`min-h-0` being load-bearing, `log(0)` not existing, an effect that would retrigger itself). It never justifies the design: no "rather than X", no "instead of Y", no "deliberately", no pointers to an ADR. Rationale belongs in `docs/adr/`, where it can be read and superseded. Delete a stale comment with the code it describes. No em dashes in user-facing copy. No comments on the members of an interface, type, struct, enum or prop list either: the field name and its type carry it, and anything else goes above the declaration.

**Routes stay thin.** `src/routes/` handles URL structure and page composition. Three routes are still fat (`distributions`, `filters`, `tree`) and are a known deferred cleanup — don't add to them.

Styling convention: Tailwind utility classes directly on elements/component `class` props — no scoped `<style>` blocks with `@apply` in routes or components. Use `rem`/`em` for custom sizing, never `px`. Icons come from `@lucide/svelte`; when placed inside a shadcn `Button`, use `data-icon="inline-start"`/`"inline-end"` (the button component handles icon sizing/spacing itself — don't add manual size classes there).
