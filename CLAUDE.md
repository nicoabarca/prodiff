# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — start the Vite dev server (frontend only, port 1420, fixed via `vite.config.js`).
- `pnpm tauri dev` — run the full desktop app (spawns the frontend dev server via `beforeDevCommand` in `src-tauri/tauri.conf.json`, then opens the native window).
- `pnpm dev:port <port>` — same, on another port (`scripts/dev-port.sh`). It derives the app identifier from the current git branch, so each branch gets its own Application Support data and two worktrees never share a SQLite database or project files.
- `pnpm seed [slug…]` — create or reset dev Projects from `scripts/seed_log/` (`scripts/seed.ts`). Each `<slug>.csv` needs a `<slug>.json` manifest holding `{ name, columns, hiddenColumns, groups? }`, where each Group is `{ name, color?, filters }` with `filters` in the exact Filter JSON the app stores (`case_not_in_group` is not supported); with no slugs every pair is seeded. It targets the current branch's app data like `dev:port` (override with `--app-id` or `--app-data-dir`), imports and applies the Groups through the `seed-project` binary (the same `event_log::importer` and `groups::apply` the app runs; the first run compiles it in release, which takes minutes), and writes rows through `schema.ts` after running the migrations. The Project id derives from the slug, so seeding it again replaces its files and deletes its Groups, comparison and tree settings.
- `pnpm db:generate <name>` — after editing `src/lib/db/schema.ts`, write the migration for it with drizzle-kit into `src/lib/db/migrations/`. Review the SQL and commit it with `meta/`. Never edit a migration that has shipped. Add `--custom` through `pnpm drizzle-kit generate --custom --name <name>` for hand-written SQL.
- `pnpm build` — build the frontend (`vite build`); `pnpm tauri build` builds the full desktop bundle. `tauri.conf.json` carries the dev identifier `com.nicoabarca.prodiff.dev`; a release build adds `--config src-tauri/tauri.release.conf.json` for `com.nicoabarca.prodiff`.
- `pnpm check` — type-check via `svelte-kit sync && svelte-check`, then `tsc -p tsconfig.scripts.json` for `scripts/` and `tsc -p e2e/tsconfig.json` for the e2e suite. Both sit outside the SvelteKit-generated `include` and are where Node built-ins appear. Run this after any change. `tsconfig.json` excludes `**/*.test.ts`, so it does not type-check test files: a fixture built from a type that has since changed passes `check` and fails only under `pnpm test`. Run both.
- `pnpm test` — run Vitest once; `pnpm test:watch` for watch mode. Config lives in `vitest.config.ts`, deliberately separate from the Tauri-tuned `vite.config.js`.
- `pnpm e2e` — run every WebdriverIO spec in `e2e/specs/` against the debug e2e binary, building it first only if it is missing. `pnpm e2e:release` does the same against a release binary it rebuilds on every run. `pnpm e2e:build` forces a debug rebuild; run it after changing Rust or frontend code, since `pnpm e2e` never notices a stale binary. Narrow any run with `--spec e2e/specs/<file>.e2e.ts` for one file or `--mochaOpts.grep "<test name>"` for one test.
- E2E binaries build with the `e2e` Cargo feature (which registers `tauri-plugin-wdio-webdriver`), the identifier `com.nicoabarca.prodiff.e2e`, and `CARGO_TARGET_DIR=src-tauri/target/e2e`, so they never share data or build output with the dev app. That identifier's app data dir is wiped once per run, before the app launches; spec files in a run share one app process and its data. Failed tests leave a screenshot in `e2e/.artifacts/` (gitignored). See `docs/adr/0007`.
- Adding/updating shadcn-svelte components: `npx shadcn-svelte@latest add <name>` (see `components.json` for config: style `lyra`, base color `neutral`, icon library `lucide`). Never hand-edit files under `src/lib/components/ui/` — treat them as generated; re-run `add`/`update` instead.

The domain vocabulary — Project, Event Log, Column Mapping, Filter, Filter List, Group, Original — is defined in `CONTEXT.md`, including the words to avoid for each. Use those terms verbatim in code, comments and user-facing copy.

## Architecture

**SPA mode, not SSR.** `src/routes/+layout.ts` sets `export const ssr = false` and `svelte.config.js` uses `@sveltejs/adapter-static` with `fallback: "index.html"` — Tauri has no Node server, so the whole app is client-rendered and all routing happens in the browser after load.

**Organized by domain, not by kind of file** (see `docs/adr/0004`). Each domain under `src/lib/` owns its own components, state, Tauri invokers, invocation contracts, utilities and tests:

```
src/lib/
├── components/        genuinely shared only
│   ├── ui/            shadcn primitives, CLI-managed, never hand-edited
│   ├── layout/        sidebar, topbar, view-placeholder
│   └── virtual-list/  own reusable component + its logic + its test
├── db/                client.ts, schema.ts (one file, all tables)
├── hooks/             shadcn
├── format.ts          global: no domain knowledge
├── utils.ts           shadcn `cn()`
├── analysis/          Summary, Test, AttributeBlock, the attribute vocabulary
├── event-log/         Project record, column mapping, upload wizard
├── filters/           filter vocabulary (one module per kind) + editor
├── groups/            Group records, Filter Lists, palette, impact cache
├── statistics/        comparison charts, metrics table, event data table
├── tree/              directed tree, variants, canvas, node detail
├── dfg/               directly-follows graph, simplification, canvas, detail panel
├── distributions/     per-node attribute distributions
└── devtools/          dev-only inspectors, one folder per view (devtools/tree/)

each domain: types.ts · invokers/ · state/ · utils/ · components/ · tests/
```

Dependencies run one way — `statistics | tree | dfg | distributions → groups → filters → event-log` — plus `distributions → tree`. Nothing points back up. `analysis` sits below all of them and depends on nothing: it holds the payload types more than one comparison view ships, and its Rust counterpart `src-tauri/src/analysis/` holds the same types plus `read_groups` and the Significance Test machinery.

`devtools` is dev-only (see `docs/adr/0009`). It may import from any domain; nothing imports it statically. Prod code reaches it only through a seam of the form `{#if import.meta.env.DEV}{#await import("$lib/devtools/…")}`, which Vite drops from `vite build` along with the chunk. A dev tool reads the state its view already holds and never adds props, callbacks or branches to prod components.

**Where new code goes:**

- A component used by one feature goes in that domain's `components/`. Only put it in `src/lib/components/` if two unrelated features use it.
- A new Tauri command gets one file in `<domain>/invokers/`, named after the command (`invoke("directed_tree", …)` → `tree/invokers/directed-tree.ts`). Components call the invoker, never `invoke()` directly.
- The read commands take **Group ids, not Filter Lists** — `directed_tree`, `dfg`, `list_variants`, `node_distributions`, `group_stats` and `shared_cases` resolve an id to its Parquet themselves. Filters only reach Rust through `filters_impact` (the draft preview) and `apply_group` (the write). `groups` is ordered, holds one or two ids, and `original` is the whole Event Log; `comparedIds()` falls back to it, which is the tree the user opens on.
- A type Rust serializes goes in `<domain>/invokers/types.ts`; everything else in `<domain>/types.ts`, including shapes persisted to SQLite that never cross `invoke`. Never re-declare a type in a second file — import it, following the direction above.
- Types at a call boundary carry a direction prefix: `Response*` for what an invoker returns (`ResponseDirectedTree`), `Request*` for what it sends (`RequestColumnMapping`). Types nested inside those stay unprefixed (`TreeNode`, `Test`, `Summary`) — the prefix marks what an invoker hands over directly, not everything bound to a serde struct.
- **Payloads are keyed by Group id, never by A/B.** `ResponseDirectedTree.groups` and `ResponseNodeDistributions.groups` are ordered arrays carrying both order and identity (`[{ id, ... }]`); everything below them is a map keyed by id — `TreeNode.cases`, `AttributeBlock.summaries`, `CategoryCount.counts`, `Distribution.counts`/`n`/`totals`, `DurationShape.ecdf`/`boxStats`/`logCounts`. `Test.higher` names the Group that ranks higher by id, `null` for chi². Ids only: Rust never learns a Group's name or colour, so a rename cannot go stale inside a cached tree, and the views join back through `comparedGroups()`. Two casings appear in one payload and neither is wrong — serde fields are camelCase, while attribute names and attribute values are the user's own column headers and cell values, verbatim.
- **Props and arguments are keyed by Group id too.** A component takes the ordered `groups` and reads its data by `group.id`; it never takes `groupA`/`groupB`, a `nameA`/`COLOR_B` pair, or a row shaped `{ a, b }`. `Bar.counts` and `CurveRow.shares` are maps keyed by id; `SummaryCompare` takes `summaries` keyed by id; `comparedGroups()` returns `Group[]`. On the Rust side the pipeline takes `&[GroupLog]`, id and DataFrame together, and `by_group`/`keyed` are the only places the positional internals meet the ids.
- A new filter kind is one file in `filters/kind/` (type, modes, copy, its `describe`/`isComplete` arms) plus two lines in `filters/kind/filter.ts`, and one file in `filters/components/editors/` plus one `{:else if}` in `filter-editor.svelte`. Mirrors `src-tauri/src/filters/`, where the file names are the Rust ones: `kind/case-not-in-group.ts` is `filters/group_membership.rs`.
- `case_not_in_group` is the one filter that reads something other than the log (see `docs/adr/0006`). Its excluded case ids are resolved in `queries::filtered` before the pipeline runs and handed to `filters::apply` as `ExcludedCases`; a Group that has never been applied contributes nothing. It also makes Groups a dependency graph — scanned out of Filter Lists by `dependentsOf`, never stored — and deleting a Group cascades to everything that excludes it.
- Tests go in `<domain>/tests/{components,state,invokers,utils}/`. Shared components keep their test beside their source. A test using runes must have `.svelte` in its filename (`drafts.svelte.test.ts`) or Vitest will not compile them.

**Conventions:** kebab-case filenames and folders throughout. Deep imports, no barrel files — `import type { Group } from "$lib/groups/types"`, not from a domain index. Prefer the `$lib` alias over relative paths.

**Comments document, they don't argue.** A comment says what a thing is, the units and contracts it carries, or a behavior surprising enough to trip the next reader (`min-h-0` being load-bearing, `log(0)` not existing, an effect that would retrigger itself). It never justifies the design: no "rather than X", no "instead of Y", no "deliberately", no pointers to an ADR. Rationale belongs in `docs/adr/`, where it can be read and superseded. Delete a stale comment with the code it describes. No em dashes in user-facing copy. No comments on the members of an interface, type, struct, enum or prop list either: the field name and its type carry it, and anything else goes above the declaration.

**Routes stay thin.** `src/routes/` handles URL structure and page composition. Three routes are still fat (`distributions`, `filters`, `tree`) and are a known deferred cleanup — don't add to them.

**Groups are materialized.** A Group is a Filter List applied to the Event Log and written to `{app_data}/projects/{project_id}/groups/{group_id}.parquet` (see `docs/adr/0005`). The Filter List stays the source of truth; the Parquet is its product. `apply_group` writes the file and returns the Group's figures in the same pass, so `stats` non-null means "this Group has a Parquet" and null means "not applied yet" — there is no separate key column to compare. The row is written before the file and deleted after it, so a file without a row is unreachable; `loadGroups` checks the file still exists and drops the cached figures when it does not. Group ids are eight random base62 characters and are never reused, because a copied Filter List can carry `case_not_in_group(id)`.

**The schema changes only through migrations.** `src/lib/db/migrate.ts` runs every drizzle-kit migration above the database's `PRAGMA user_version`, each as one transaction that also sets the version. The app bundles them through `bundled-migrations.ts`; `scripts/seed.ts` reads the same files from disk. Before migrating a database that already has data, the app copies it with `VACUUM INTO` to `{app_data}/backups/prodiff-v{version}.db` (the last three are kept). A failed migration or a database newer than the build replaces the whole app with `DatabaseProblem`.

**Editing is a draft until Apply.** `groups/state/drafts.svelte.ts` holds unapplied Filter Lists in memory, keyed by Group id; `draftOf` falls back to the applied list, `isDirty` compares the two by `filtersKey`. Add, replace, remove, reorder and clear are all one array operation on that draft — reordering included, which is a real edit because `keep_selected`/`trim` change what the filters after them see. Apply is the only write.

`impacts` (per-Group `{key, steps}`, in memory, filled by the Filters view via `loadImpact`, read with `groupSteps`/`groupCases`) is the draft preview only. It writes nothing and its numbers belong to the draft, not to the Group — anything showing them must label them as the draft's.

The Original is not a row: it is the whole Event Log, synthesized by `originalGroup()`, answering to the id `original` everywhere including in Rust.

**Which Groups the tree compares** is the compare modal's decision, persisted per project in the `comparisons` table and read through `comparedGroups()` / `comparedIds()`. What the tree is built from — the attributes to test and the Variants to include — is persisted per project too, in `tree_settings`; the tree itself is never cached and lives in memory while the app is open. A selection naming a Group that has since been deleted or un-applied falls away rather than failing the build, so the tree degrades to the Original, which is also what a project with no Groups opens on. The modal reports the shared case count at selection time and offers to build a Difference Group instead of removing the overlap.

Styling convention: Tailwind utility classes directly on elements/component `class` props — no scoped `<style>` blocks with `@apply` in routes or components. Use `rem`/`em` for custom sizing, never `px`. Icons come from `@lucide/svelte`; when placed inside a shadcn `Button`, use `data-icon="inline-start"`/`"inline-end"` (the button component handles icon sizing/spacing itself — don't add manual size classes there).
