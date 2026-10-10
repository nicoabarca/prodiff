# src/lib

Paths below are relative to `src/lib/`.

## groups

**Groups are materialized.** A Group is a Filter List applied to the Event Log and written to `{app_data}/projects/{project_id}/groups/{group_id}.parquet` (see `docs/adr/0005`). The Filter List stays the source of truth; the Parquet is its product. `apply_group` writes the file and returns the Group's figures in the same pass, so `stats` non-null means "this Group has a Parquet" and null means "not applied yet" — there is no separate key column to compare. The row is written before the file and deleted after it, so a file without a row is unreachable; `loadGroups` checks the file still exists and drops the cached figures when it does not. Group ids are eight random base62 characters and are never reused, because a copied Filter List can carry `case_not_in_group(id)`.

**Editing is a draft until Apply.** `groups/state/drafts.svelte.ts` holds unapplied Filter Lists in memory, keyed by Group id; `draftOf` falls back to the applied list, `isDirty` compares the two by `filtersKey`. Add, replace, remove, reorder and clear are all one array operation on that draft — reordering included, which is a real edit because `keep_selected`/`trim` change what the filters after them see. Apply is the only write.

`impacts` (per-Group `{key, steps}`, in memory, filled by the Filters view via `loadImpact`, read with `groupSteps`/`groupCases`) is the draft preview only. It writes nothing and its numbers belong to the draft, not to the Group — anything showing them must label them as the draft's.

The Original is not a row: it is the whole Event Log, synthesized by `originalGroup()`, answering to the id `original` everywhere including in Rust.

**Which Groups are compared** is the compare modal's decision, persisted per project in the `comparisons` table and read through `comparedGroups()` / `comparedIds()`. `groups` is ordered and holds one or two ids; `comparedIds()` falls back to `original`, which is the tree the user opens on. A selection naming a Group that has since been deleted or un-applied falls away rather than failing the build, so the views degrade to the Original, which is also what a project with no Groups opens on. The modal reports the shared case count at selection time and offers to build a Difference Group instead of removing the overlap.

## filters

A new filter kind is one file in `filters/kind/` (type, modes, copy, its `describe`/`isComplete` arms) plus two lines in `filters/kind/filter.ts`, and one file in `filters/components/editors/` plus one `{:else if}` in `filter-editor.svelte`. Mirrors `src-tauri/src/filters/`, where the file names are the Rust ones: `kind/case-not-in-group.ts` is `filters/group_membership.rs`.

`case_not_in_group` is the one filter that reads something other than the log (see `docs/adr/0006`). Its excluded case ids are resolved in `queries::filtered` before the pipeline runs and handed to `filters::apply` as `ExcludedCases`; a Group that has never been applied contributes nothing. It also makes Groups a dependency graph — scanned out of Filter Lists by `dependentsOf`, never stored — and deleting a Group cascades to everything that excludes it.

Filters only reach Rust through `filters_impact` (the draft preview) and `apply_group` (the write). Both invokers are in `groups/invokers/`.

## tree

**What the tree is built from** — the attributes to test and the Variants to include — is persisted per project in `tree_settings`; the tree itself is never cached and lives in memory while the app is open.

The Variant vocabulary — `ResponseVariantRow`, `list_variants`, `utils/variants.ts` — stays in `tree`, and the DFG imports it.

## The toolbar the tree and the DFG share

**The tree and the DFG share one toolbar** (see `docs/adr/0015`). Both views open on a row of `SettingField`s — what is compared, which Variants, which attributes are tested — composed by `tree/components/tree-toolbar.svelte` and `dfg/components/dfg-toolbar.svelte` out of the same three pieces:

- `groups/components/compare-field.svelte` is the whole Compare control, the field and the `CompareDialog` behind it, taking the project and a bindable `open`. It carries the `compare-groups` Tour anchor.
- `custom-attributes/components/attributes-field.svelte` is the Attributes tested field and its list. It holds nothing: the view passes `options`, `selected`, `caption`, `note` and `onToggle`, so the tree can keep a draft until the popover closes and write it to `tree_settings`, while the DFG rebuilds on each change from its in-memory selection. The adapters are each domain's `build-settings.svelte`.
- `components/variant-panel/` is the Variants panel, its rows and its toolbar field. They know neither view: they take the Groups, the rows, the staged set and the callbacks, plus `canvas` naming the view that opened them. The staging is `tree/state/variant-selection.svelte.ts`, a factory each view instantiates with where its selection is persisted and what an empty one means — `"coverage"` for the tree, where empty is "not chosen yet" and is re-seeded from `DEFAULT_COVERAGE`, and `"all"` for the DFG, where empty is every Variant. The adapters are each domain's `variant-panel.svelte` and `variant-summary.svelte`, binding its own state and counting the Variants its canvas draws.

## dfg

**The DFG can split into one panel per Group** (see `docs/adr/0016`). `view.split` plus exactly two compared Groups is what `splitting()` answers; the toolbar's Split field toggles it and the route picks `split-canvas.svelte` over `canvas.svelte`. Both panels are cut by the one Behaviour and Paths pair in the toolbar, laid out from that whole cut rather than from what either panel draws, and bound to one `Viewport`, so coordinates and pan/zoom match on both sides. A panel passes `focus`, which drops what its Group never reaches and narrows every figure, shade and thickness to it; an activity reads grey unless that Group alone reaches it. Nothing in `DfgView` can express two different cuts, and that is deliberate.

Moving a slider reframes what is left: `reframe()` bumps `refit.at`, the canvas holds that request until the ELK placement it is meant to frame has landed, and `refit.svelte` performs it from inside `SvelteFlow`, where `useSvelteFlow` resolves. In a split only the panel that fits runs it; the other follows through the shared viewport.

## db

`db/client.ts` opens the database; `db/schema.ts` holds every table in one file.

**The schema changes only through migrations.** `db/migrate.ts` runs every drizzle-kit migration above the database's `PRAGMA user_version`, each as one transaction that also sets the version. The app bundles them through `bundled-migrations.ts`; `scripts/seed.ts` reads the same files from disk. Before migrating a database that already has data, the app copies it with `VACUUM INTO` to `{app_data}/backups/prodiff-v{version}.db` (the last three are kept). A failed migration or a database newer than the build replaces the whole app with `DatabaseProblem`.

`pnpm db:generate <name>` — after editing `db/schema.ts`, write the migration for it with drizzle-kit into `db/migrations/`. Review the SQL and commit it with `meta/`. Never edit a migration that has shipped. Add `--custom` through `pnpm drizzle-kit generate --custom --name <name>` for hand-written SQL.

The boot screen shown while the database opens and migrates is `db/components/boot-screen.svelte`, driven by the root layout.
