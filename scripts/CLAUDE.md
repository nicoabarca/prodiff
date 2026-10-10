# scripts

## `pnpm seed [slug…]`

Creates or resets dev Projects from `scripts/seed_log/`, or from another directory with `--seed-dir <dir>` (`scripts/seed.ts`). With no slugs every pair is seeded.

Each `<slug>.csv` needs a `<slug>.json` manifest holding `{ name, columns, hiddenColumns, customAttributes?, groups? }`, where each Custom Attribute is `{ name, formula }` with the formula as the editor writes it, and each Group is `{ name, color?, filters }` with `filters` in the exact Filter JSON the app stores, except that `case_not_in_group` names an earlier Group as `{ kind, group: "<name>" }` (Custom Attribute ids are generated per run, so a Group cannot filter on one).

It targets the current branch's app data like `dev:port` (override with `--app-id` or `--app-data-dir`), imports the log, writes the Custom Attributes and applies the Groups through the `seed-project` binary (the same `event_log::importer`, `custom_attributes::update` and `groups::apply` the app runs; the first run compiles it in release, which takes minutes), and writes rows through `schema.ts` after running the migrations. The Project id derives from the slug, so seeding it again replaces its files and deletes its Custom Attributes, Groups, comparison and tree settings.

## `pnpm dev:port <port>`

`dev-port.sh` runs the desktop app on another port. It derives the app identifier from the current git branch, so each branch gets its own Application Support data and two worktrees never share a SQLite database or project files.

## `pnpm sample:generate`

Rewrites the Sample Project's Event Log, `src-tauri/resources/sample-project/loan-applications.csv`, from the seeded generator in `scripts/sample-log.ts`. Commit both; `scripts/tests/sample-log.test.ts` fails when they disagree. The rest of the Sample Project (Column Mapping, Groups, comparison, tree attributes) is `src/lib/sample-project/manifest.ts`. Raise `SAMPLE_VERSION` there whenever either changes, so an existing Sample Project offers to update.

## `pnpm release <patch|minor|major|x.y.z>`

From a clean `main` matching `origin/main`, sets the version in `package.json`, `Cargo.toml`, `tauri.conf.json` and `Cargo.lock`, commits, tags `v<version>` and pushes. The tag builds Windows into a draft release in CI. `pnpm release:mac`, run on that tag, builds Apple Silicon locally and adds it to the draft. Publishing the draft is manual. See `docs/adr/0011`.

## `inbox/`

`inbox/vite-plugin.ts` bridges the dev element picker (`src/lib/devtools/picker/`) to the Claude Inbox channel in `~/.claude/channels/inbox/`, which reaches sessions started with the `channels-claude` shell function. See `docs/adr/0017`.
