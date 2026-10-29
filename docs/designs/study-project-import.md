# Import a study Project from a bundle

*   **Author:** Nicolás Abarca
*   **Status:** Approved
*   **Date:** 2026-10-29

--------------------------------------------------------------------------------

## Overview

ProDiff gains an **Import study Project** action. The participant picks one item, either a `.zip` file or the folder it unzips into, and the app builds a complete Project from it. The bundle holds the Event Log as a CSV and a JSON manifest. The manifest describes the Column Mapping, Hidden Columns, Custom Attributes and Groups. The participant sees no Column Mapping step and sets up nothing by hand.

The feature exists for one in-person thesis user study, and is removed after it.

## The Problem

The thesis study runs with 10-12 lab members on their own laptops, a mix of macOS and Windows. They install the public release from the GitHub Pages site. Every participant must start the 30-minute analytical tasks from the same prepared Project:

*   the Road Traffic Fine Management Event Log (150,370 cases, about 561k events, about 47 MB of CSV, Spanish activity names, a few synthetic columns);
*   its Column Mapping, including `amount` mapped at case scope with `caseResolution: "first"`;
*   its Hidden Columns;
*   its Custom Attributes, at least one of which a Group filters on;
*   its Groups, all applied. Participants build their three Comparisons from these Groups during the tasks.

Today there is no way to put that Project on a participant's laptop:

*   **Building it by hand** through the upload wizard, Custom Attribute editor and Filters view takes too long, and different participants would make different mistakes. The starting point would no longer be identical.
*   **`pnpm seed`** builds exactly this kind of Project from a CSV and a manifest, but it needs the repository, Node and a Rust release build. Participants have only the installed app.
*   **Bundling the CSV in the installer**, as the Sample Project is bundled, would add about 47 MB to every public release for a one-off study.
*   **Copying the app data folder** between machines fails, because SQLite stores `original_path` and `event_log_path` as absolute paths. Those break across usernames and between macOS and Windows.

The proposed solution is a study bundle, `manifest.json` plus one `.csv`, that the installed app imports through the same Rust code `pnpm seed` runs. The author writes the manifest once, checks it with `pnpm seed` on their own machine, and hosts the bundle as a GitHub release asset.

## Goals

*   A participant creates the study Project by picking one `.zip` or one folder from the "Import study Project" action in Settings, which sits outside the main Projects grid. The import needs no other input, except a confirmation when the study Project already exists.
*   Every participant ends up with the same Project. Identical means the same Event Log, Column Mapping, Hidden Columns, Custom Attribute formulas, and Group Filter Lists and colours. Only the generated ids differ.
*   A Group Filter can name a Custom Attribute or an earlier Group by name, and the import turns each name into the id it just generated.
*   `pnpm seed` and the app share the manifest types and the code that turns names into ids. A manifest that seeds correctly on the author's machine therefore imports correctly in the app.
*   A failed import, including a failed re-import, leaves any existing study Project exactly as it was.
*   The participant sees progress while the import runs and a success message with the case, event and Group counts. A failure shows one plain sentence, a next step, and a detail line that can be copied for the author.
*   Importing the same bundle again replaces the study Project. This is the reset fallback if something goes wrong during a session.

## Non-Goals

*   **Export.** The author writes the manifest by hand. Reconsider only if a later study needs Projects designed in the app.
*   **Saved Comparisons, a current comparison, tree settings, DFG settings or Tours** in the bundle. Participants build their Comparisons from the Groups.
*   **XES inside the bundle.** The study log is CSV.
*   **Case-level Custom Attributes**, which are being built on another branch. The import must not depend on that branch.
*   **Importing bundles from other sources or older formats.** Only `formatVersion: 1` is accepted.
*   **Collecting participants' Projects.** Answers go to a Google Form.
*   **Keeping the feature after the study.** It is removed in one revert.

## Open Questions

*   None at this stage.

## Critical User Journeys (CUJs)

### CUJ 1: First import on a participant's laptop

*   **Given**: The participant has installed the release the author named in the study instructions, has no study Project, and has downloaded `study.zip` from the GitHub release. Safari may have unzipped it into a folder.
*   **When**: They open Settings, choose "Import study Project" and pick the `.zip` or the folder.
*   **Then**: A blocking progress dialog shows until the import finishes. A success message names the Project and shows its case, event and Group counts, which match the handout. The Project appears in the Projects grid with its Custom Attributes and applied Groups, no Saved Comparison, and no comparison selected.

### CUJ 2: Reset during a session

*   **Given**: The participant already has the study Project and has changed it.
*   **When**: They import the same bundle again.
*   **Then**: A confirmation warns that their changes to the study Project will be discarded. After they confirm, the Project is rebuilt as in CUJ 1. If they cancel, nothing changes.

### CUJ 3: A broken or wrong file

*   **Given**: The participant picks a truncated zip, a different file, or a bundle whose `formatVersion` this build does not know.
*   **When**: The import runs.
*   **Then**: The import stops. One plain sentence says what went wrong and what to do next, for example "Download study.zip again and try again" or "Update ProDiff and try again". A copyable detail line is shown for the author. Any existing study Project is unchanged, and no temporary files are left behind.

### CUJ 4: The author checks the bundle before the study

*   **Given**: The author has written `manifest.json` next to the study CSV.
*   **When**: They run `pnpm seed` on that folder.
*   **Then**: The seeded Project matches what the app import will build. Any manifest error, such as an unknown Group name, a bad formula or an unknown Filter kind, fails with the same message the app would show.

## Technical Plan (Architecture)

### The bundle

A bundle is a `.zip`, or the folder Safari unzips it into. Inside are exactly two files that matter:

*   `manifest.json`, the manifest described below.
*   One file ending in `.csv`, the Event Log. Its name becomes the Project's `fileName`.

Both files may sit at the root or inside one wrapping folder, because zip tools differ. Entries under `__MACOSX/` and files named `.DS_Store` are ignored, since macOS adds them when it compresses a folder. Anything else, such as a second CSV, a missing manifest or a nested folder deeper than one level, is an error.

The bundle is hosted as an asset on a GitHub release, not on GitHub Pages and not inside the installer.

### The manifest

The manifest is the `pnpm seed` manifest plus one field:

```text
{
  formatVersion: 1,
  name: string,                          // the Project name participants see
  columns: RequestColumnMapping[],       // the Column Mapping, as stored
  hiddenColumns: string[],
  customAttributes?: { name, formula }[],   // formula as the editor writes it
  groups?: { name, color?, filters }[]      // in order; all are applied
}
```

Filters use the exact JSON the app stores, with two name references:

*   A `case_not_in_group` Filter names an earlier Group: `{ kind: "case_not_in_group", group: "<Group name>" }`. `pnpm seed` already supports this.
*   A `numeric` Filter may name a Custom Attribute as `attribute: "<name>"` in place of `column`. The import replaces it with `column: "fx_{id}"`. This is the form `pnpm seed` reads on `main` since case-level Custom Attributes landed; an earlier draft let `column` hold the name.

The manifest carries no ids. The import generates every Group id with `groupId()` and every Custom Attribute id with `customAttributeId()`, then resolves the names above to those ids.

### Where each step runs

The work is split between two Tauri commands and one TypeScript orchestrator. The split follows what each side already owns:

*   The formula parser and the Custom Attribute validation exist only in TypeScript (ADR 0012, materialize Custom Attributes by id).
*   Reading zips and writing Parquet happen in Rust.
*   SQLite rows are written from TypeScript (ADR 0001).

```text
 Settings page                 TypeScript (project-import)                    Rust (project_import)
 -------------                 ---------------------------                    ---------------------
 pick .zip or folder  ──────►  openBundle(path) ──────────────────────────►   open_bundle
                                                                                ├─ zip: extract the two
                                                                                │  files to {app_data}/imports/
                                                                                └─ folder: read in place
                               ◄── { manifestText, csvPath, csvFileName } ───┘

                               readManifest(text)      parse JSON, check shape and formatVersion
                               resolveManifest(m)      new ids; names → ids; parse and
                                                       validate formulas
                               confirm replace if the study Project exists

                               importProject(id, csvPath, columns,  ─────►   import_project
                                 customAttributes, groups)                     ├─ build into .{id}-import:
                                                                                │    import_event_log
                                                                                │    custom_attributes::update
                                                                                │    groups::apply (each)
                                                                                ├─ swap into projects/{id}
                                                                                └─ delete extracted files
                               ◄── { eventLog, customAttributes, groups } ───┘

                               persist rows: delete the old Project's rows, insert
                               Project, Custom Attributes, Groups (with stats)
 success: name + counts ◄────
```

### Rust: one build function for the seed and the app

`seed()` in `src-tauri/src/bin/seed-project.rs` already runs the three steps in the right order:

1.  `import_event_log` with no Groups.
2.  `custom_attributes::update`, which adds the `fx_{id}` columns to the Event Log.
3.  `groups::apply` for each Group, with the Column Mapping extended by one float column per Custom Attribute (`analysis_columns`).

Step 3 has to come after step 2, because a Group may filter on an `fx_` column. `import_event_log` cannot apply these Groups itself, since it runs before the Custom Attributes exist.

`seed()` and `analysis_columns()` move into the library as `project_import::build(project_dir, source, columns, custom_attributes, groups)`. The `seed-project` binary becomes a thin wrapper that reads stdin and calls `build`. The new `import_project` command calls the same function, so the author's `pnpm seed` check runs the code participants run.

**Making the whole build atomic.** `import_event_log` stages its own files and swaps them in, but steps 2 and 3 then write into the live Project folder. `pnpm seed` gets atomicity because `seed.ts` passes a staging folder as `project_dir` and swaps it in itself. `import_project` does the same, in Rust:

1.  Build into `.{id}-import`, beside `projects/{id}`.
2.  If any step fails, delete `.{id}-import`. The existing Project is untouched.
3.  If every step succeeds, move `projects/{id}` aside, move `.{id}-import` into its place, then delete the old copy.

The importer already has this swap as the private `swap_into_place`, `previous_dir` and `sibling_dir` in `event_log/importer.rs`. They become `pub(crate)` and are reused rather than written again.

**Opening the bundle.** `open_bundle(path)` accepts a `.zip` file or a folder:

*   For a zip, it clears `{app_data}/imports/`, which removes anything left by an import that was interrupted. It then extracts only the manifest and the CSV there.
*   For a folder, it reads the two files in place and extracts nothing.

It returns the manifest as text and the CSV's path and file name. Extraction uses the `zip` crate, a new dependency. Entry names go through `ZipFile::enclosed_name`, which rejects absolute paths and `..`. `import_project` deletes `{app_data}/imports/` when it finishes, whether it succeeds or fails.

### TypeScript: one manifest module for the seed and the app

A new domain, `src/lib/project-import/`, holds the manifest types and two pure functions that `scripts/seed.ts` and the app both call:

*   **`readManifest(text)`** parses the JSON and checks the shape a person might get wrong:
    *   `formatVersion` is `1`;
    *   the required fields are present;
    *   every Filter has a known `kind`;
    *   Group names are unique;
    *   Custom Attribute names are unique.

    It does not re-check every Filter field. A malformed Filter fails when Rust deserializes it, inside the staging folder, before anything is swapped in.
*   **`resolveManifest(manifest)`** does three things:
    *   generates ids;
    *   parses each formula with `parseFormula` and checks it with `nameError` and `formulaColumnError`, which also enforce that a column a formula reads is not hidden;
    *   rewrites each `case_not_in_group` Group name and each Custom Attribute name in a Filter `column` to its id.

    A name that resolves to nothing is an error naming the Group, the Filter's position and the name.

Today `seed.ts` holds its own versions of these steps (`seedGroups`, the formula checks in `seedInput`). It switches to the shared module, so the two cannot drift.

The domain sits above `event-log`, `filters`, `groups` and `custom-attributes`, the same layer as `sample-project`. It adds an edge to the dependency direction in the root `CLAUDE.md`. The Settings page is its only importer.

### Persisting the rows

After `import_project` returns, the orchestrator writes SQLite through the existing state modules, as `createSampleProject` does:

1.  Delete the old Project's rows: its Custom Attributes, Groups, Saved Comparisons, current comparison, tree settings and DFG settings. This step never calls `removeProject`, because `removeProject` also deletes the files that were just swapped in.
2.  Insert the Project row, its Custom Attributes with their empty counts, and its Groups with their stats.

Today `removeProject` leaves the `comparisons`, `tree_settings` and `dfg_settings` rows behind. The new delete step covers them, so a re-imported Project never reopens on Groups that no longer exist.

The file swap and the row writes are not one transaction. The webview's SQLite connection is pooled (ADR 0010), and the files live outside it. If the app dies between the two, the folder holds the new files while the rows describe the old Project. Importing again repairs this, because every step replaces rather than adds. The Sample Project has the same gap.

### Project id, replacement and errors

*   **Project id:** `uuidv5("prodiff:import:" + name)`, using the `uuid` package the app already depends on. The same bundle always maps to the same Project, so a second import replaces it. No uploaded Project (random v4 ids), seeded Project (`prodiff:seed:` namespace) or Sample Project can collide with it.
*   **Replacement:** before calling `import_project`, the orchestrator checks whether a Project with that id exists. If one does, it asks for confirmation, and nothing is written until the participant confirms.
*   **Errors:** each failure maps to one plain sentence and a next step. The original message stays as the copyable detail line. There are three kinds:
    *   **Cannot read the bundle**, from `open_bundle` or `readManifest`: "This is not the study file. Download study.zip again and pick it."
    *   **Unknown `formatVersion`**: "Update ProDiff and try again."
    *   **Build failure**, from `resolveManifest` or `import_project`: "The study file could not be imported. Send this message to the researcher."

### The Settings entry point

`src/routes/app/settings/+page.svelte` gains a "Study" section that renders one component from the new domain. The component holds the button labelled "Import study Project" and the picker. The picker is a `@tauri-apps/plugin-dialog` `open` call: zip files by default, with a second button for picking a folder, because one dialog cannot select both files and folders on every platform. The component also holds the replace confirmation, a blocking progress dialog, and the success and error states. The Projects grid is unchanged.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The work lands in five steps. Each one passes `pnpm check`, `pnpm test` and `cargo test` before the next begins:

1.  The Rust build function and the seed binary.
2.  The shared manifest module and `seed.ts`.
3.  The bundle and import commands.
4.  The orchestrator and the Settings UI.
5.  Docs and the ADR.

### Target Files to Create/Modify

#### Step 1: one build function in Rust

##### 1. `src-tauri/src/project_import/mod.rs` (Create)

*   **Type / Scope**: Rust module, library.
*   **Proposed Changes**:
    *   Module doc: builds a Project from an Event Log, Custom Attributes and Groups, for `pnpm seed` and the study import.
    *   `pub struct BuildInput { columns: Vec<ColumnMapping>, custom_attributes: Vec<CustomAttribute>, groups: Vec<GroupFilters> }`, `Deserialize`, camelCase, both lists `#[serde(default)]`. This is the old `Seed` struct from the binary.
    *   `pub struct Built { event_log: CreateEventLogResult, custom_attributes: Vec<EmptyCount>, groups: Vec<serde_json::Value> }`, `Serialize`, camelCase. This is the old `Seeded`.
    *   `fn analysis_columns(input: &BuildInput) -> Result<Vec<ColumnMapping>, String>`, moved unchanged from the binary.
    *   `pub fn build(project_dir: &Path, source: &str, input: &BuildInput) -> Result<Built, String>`, moved from the binary's `seed()`. It runs `import_event_log` with no Groups, then `custom_attributes::update`, then `groups::apply` for each Group in order, with Group errors prefixed `Group {id}:`. It writes into `project_dir` directly. Callers that need atomicity pass a staging folder.
    *   `pub fn build_staged(project_dir: &Path, source: &str, input: &BuildInput) -> Result<Built, String>` runs `build` into `sibling_dir(project_dir, "import")`, the folder `.{id}-import` beside the Project. It deletes that folder on failure, and on success calls the importer's `swap_into_place`.
    *   `pub mod bundle;` and `pub mod commands;` are added in Step 3.
    *   `#[cfg(test)]` tests:
        *   `build` on a small CSV fixture with one Custom Attribute and one Group whose `numeric` Filter reads that Custom Attribute's `fx_` column. The Group's Parquet exists and holds only matching cases.
        *   `build_staged` with a Group whose Filter names a missing column fails, and leaves an existing `project_dir` byte-identical with no `.{id}-import` folder behind.

##### 2. `src-tauri/src/bin/seed-project.rs` (Modify)

*   **Type / Scope**: Rust binary.
*   **Proposed Changes**: delete `Seed`, `Seeded`, `analysis_columns` and `seed()`. `main` reads stdin into `project_import::BuildInput` and calls `project_import::build`. Its output on stdout is unchanged, so `seed.ts` keeps working. Update the header doc to point at `project_import`.

##### 3. `src-tauri/src/event_log/importer.rs` (Modify)

*   **Type / Scope**: Rust module.
*   **Proposed Changes**: make `swap_into_place` and `sibling_dir` `pub(crate)` so `project_import` reuses them. No behaviour change.

##### 4. `src-tauri/src/lib.rs` (Modify)

*   **Type / Scope**: Rust crate root.
*   **Proposed Changes**: add `pub mod project_import;`. It must be `pub` because the `seed-project` binary imports it through `prodiff_lib`.

#### Step 2: one manifest module in TypeScript

##### 5. `src/lib/project-import/types.ts` (Create)

*   **Type / Scope**: TypeScript types.
*   **Proposed Changes**: the manifest as written, moved out of `scripts/seed.ts` and extended:
    *   `ManifestFilter` is a Filter with two by-name forms: `case_not_in_group` as `{ kind, group: string }`, and a Custom Attribute name allowed in the `column` field of `attribute`, `numeric` and `follower`.
    *   `ManifestGroup` is `{ name, color?, filters: ManifestFilter[] }`.
    *   `ManifestCustomAttribute` is `{ name, formula }`.
    *   `Manifest` is `{ formatVersion: 1, name, columns, hiddenColumns, customAttributes?, groups? }`.
    *   `ResolvedManifest` carries `name`, `columns`, `hiddenColumns`, the Custom Attributes as `{ id, name, text, formula }` and the Groups as `{ id, name, color?, filters: Filter[] }`.

##### 6. `src/lib/project-import/utils/manifest.ts` (Create)

*   **Type / Scope**: pure TypeScript, no Tauri imports, so `scripts/seed.ts` can import it under Node.
*   **Proposed Changes**:
    *   **`MANIFEST_FORMAT_VERSION = 1`.**
    *   **`readManifest(text: string): Manifest`** throws a `ManifestError` (message plus `kind: "unreadable" | "version"`). It checks:
        *   the text is JSON;
        *   `formatVersion` is present and equals `MANIFEST_FORMAT_VERSION` (kind `version`);
        *   `name` is a non-empty string, and `columns` and `hiddenColumns` are arrays;
        *   every hidden column names a column;
        *   Group names are unique, and every Group has a `filters` array;
        *   every Filter `kind` is one of the union's kinds, read from `src/lib/filters/kind/filter.ts`;
        *   Custom Attribute names are unique.

        Everything else is left to Rust deserialization.
    *   **`resolveManifest(manifest: Manifest): ResolvedManifest`** is the old `seedInput` Custom Attribute loop plus `seedGroups`, generalized:
        1.  For each Custom Attribute: generate an id with `customAttributeId()`, run `parseFormula`, then `nameError` and `formulaColumnError` against a Project scope built from `columns` and `hiddenColumns`. Throw `Custom attribute "<name>": <problem>.` on failure.
        2.  For each Group in order: generate an id with `groupId()`. Rewrite a `case_not_in_group` Group name to the id of an earlier Group, or throw the existing seed message. Rewrite a numeric Filter's `attribute` to `column: customAttributeColumn(id)`, which is the `fx_{id}` helper the custom-attributes domain already uses, or throw when no Custom Attribute has that name.
    *   **`importedRows(projectId, resolved, built, fileName, now)`** returns `{ project, customAttributes, groups }` rows. It merges the old `seededProject`, `seededCustomAttributes` and `seededGroups` from `seed.ts`, so the seed and the app build identical rows. The colour defaults to `defaultColor(position)`, and every Group carries its stats.
    *   **`importedProjectId(name)`** returns `uuidv5("prodiff:import:" + name, uuidv5.URL)`.

##### 7. `src/lib/project-import/tests/utils/manifest.test.ts` (Create)

*   **Type / Scope**: Vitest.
*   **Proposed Changes**: cover
    *   `readManifest`: bad JSON; a missing or wrong `formatVersion`, which gives kind `version`; an unknown Filter kind; a duplicate Group name; a hidden column that is not a column.
    *   `resolveManifest`: a Custom Attribute name in a `numeric` Filter becomes `fx_{id}` with the generated id; a raw column name is left alone; `case_not_in_group` resolves to an earlier Group and fails on a later one; a formula reading a hidden column fails with the Custom Attribute's name.
    *   `importedRows`: positions, colours and stats line up with the Groups' order.
    *   The committed `scripts/seed_log/road_traffic_fine_10k.json` passes `readManifest` and `resolveManifest`. That catches a Filter union change breaking the manifest format.

##### 8. `scripts/seed.ts` (Modify)

*   **Type / Scope**: Node script.
*   **Proposed Changes**:
    *   Delete the local `ManifestFilter`, `ManifestGroup`, `ManifestCustomAttribute`, `Manifest`, `SeedGroup`, `seedGroups`, `seededProject`, `seededCustomAttributes` and `seededGroups`.
    *   `seedInput` calls `readManifest` on the file text and `resolveManifest` on the result.
    *   The row building calls `importedRows`.
    *   `persistSeed` also deletes the Project's `dfg_settings` row, the same gap as `removeProject`.
    *   The seed's own Project id (`prodiff:seed:<slug>`) and its staging-and-swap stay as they are.

##### 9. `scripts/seed_log/road_traffic_fine_10k.json` (Modify)

*   **Type / Scope**: seed manifest.
*   **Proposed Changes**: add `"formatVersion": 1`, which `readManifest` now requires.

#### Step 3: open the bundle and import it

##### 10. `src-tauri/Cargo.toml` (Modify)

*   **Type / Scope**: build config.
*   **Proposed Changes**: add the `zip` crate with `default-features = false, features = ["deflate"]`. Deflate is what macOS Finder and Windows Explorer write, and leaving out the other codecs keeps the build small.

##### 11. `src-tauri/src/project_import/bundle.rs` (Create)

*   **Type / Scope**: Rust module, no Tauri types, so it is testable with plain paths.
*   **Proposed Changes**:
    *   `pub struct OpenedBundle { manifest_text: String, csv_path: String, csv_file_name: String }`, `Serialize`, camelCase.
    *   `pub fn open(path: &Path, imports_dir: &Path) -> Result<OpenedBundle, String>`:
        *   If `path` is a folder: find `manifest.json` and exactly one `*.csv` at its root, or inside its single subfolder. Read the manifest text, and return the CSV path in place.
        *   If `path` is a file: open it as a zip and clear and recreate `imports_dir`. Walk the entries and skip directories, anything under `__MACOSX/`, and any `.DS_Store`. For each remaining entry, take `enclosed_name()` and reject the bundle if it is `None`. Accept entries at depth 0 or 1 under one shared top folder. Require exactly one `manifest.json` and exactly one `*.csv`, and reject any other file. Stream the CSV to `imports_dir/<file name>`, and read the manifest into memory.
        *   Error messages name what was wrong: "has no manifest.json", "has 2 CSV files", "is not a zip file or a folder".
    *   `#[cfg(test)]` tests build zips in a temp folder:
        *   root layout, a wrapping folder, `__MACOSX` entries ignored;
        *   two CSVs rejected; missing manifest rejected; an entry named `../x.csv` rejected;
        *   a folder bundle read in place.

##### 12. `src-tauri/src/project_import/commands.rs` (Create)

*   **Type / Scope**: Tauri commands.
*   **Proposed Changes**:
    *   `open_bundle(app, path: String) -> Result<OpenedBundle, String>` resolves `{app_data}/imports/` and calls `bundle::open` off the main thread with `parsing::commands::off_main_thread`.
    *   `import_project(app, project_id: String, csv_path: String, input: BuildInput) -> Result<Built, String>` resolves the Project folder with `project_dir_for_app` and runs `build_staged` off the main thread. It then removes `{app_data}/imports/` whether the build succeeded or failed, ignoring a missing folder.

##### 13. `src-tauri/src/lib.rs` (Modify)

*   **Type / Scope**: Rust crate root.
*   **Proposed Changes**: register `project_import::commands::open_bundle` and `project_import::commands::import_project` in `generate_handler!`.

##### 14. `src/lib/project-import/invokers/types.ts` (Create)

*   **Type / Scope**: TypeScript types for what Rust serializes.
*   **Proposed Changes**:
    *   `ResponseOpenBundle { manifestText: string; csvPath: string; csvFileName: string }`.
    *   `ResponseImportProject { eventLog: ResponseCreateEventLog; customAttributes: ResponseEmptyCount[]; groups: ResponseEventLogStats[] }`, imported from their domains, not re-declared.
    *   `RequestImportProject { columns; customAttributes: RequestCustomAttribute[]; groups: Pick<Group, "id" | "filters">[] }`.

##### 15. `src/lib/project-import/invokers/open-bundle.ts` (Create)

*   **Type / Scope**: invoker.
*   **Proposed Changes**: `openBundle(path: string): Promise<ResponseOpenBundle>` wraps `invoke("open_bundle", { path })`.

##### 16. `src/lib/project-import/invokers/import-project.ts` (Create)

*   **Type / Scope**: invoker.
*   **Proposed Changes**: `importProject(projectId, csvPath, input: RequestImportProject): Promise<ResponseImportProject>` wraps `invoke("import_project", …)`.

#### Step 4: orchestration and the Settings entry point

##### 17. `src/lib/custom-attributes/state/custom-attributes.svelte.ts` (Modify)

*   **Type / Scope**: state module.
*   **Proposed Changes**: add `addCustomAttributes(rows: CustomAttribute[])`, a bulk insert mirroring `addGroups`. Today only `createCustomAttribute` exists, and it writes one row with editor semantics.

##### 18. `src/lib/groups/state/comparison.svelte.ts` (Modify)

*   **Type / Scope**: state module.
*   **Proposed Changes**: add `deleteComparison(projectId)`, which deletes the Project's `comparisons` row and clears the in-memory comparison if it belongs to that Project.

##### 19. `src/lib/tree/state/tree.svelte.ts` (Modify)

*   **Type / Scope**: state module.
*   **Proposed Changes**: add `deleteSettings(projectId)` for the `tree_settings` row.

##### 20. `src/lib/dfg/state/variants.svelte.ts` (Modify)

*   **Type / Scope**: state module.
*   **Proposed Changes**: add `deleteSettings(projectId)` for the `dfg_settings` row.

##### 21. `src/lib/project-import/utils/import.ts` (Create)

*   **Type / Scope**: orchestrator, written like `sample-project/utils/create.ts`.
*   **Proposed Changes**:
    *   **`prepareImport(path)`** calls `openBundle`, then `readManifest`, then `resolveManifest`. It returns `{ projectId, resolved, csvPath, csvFileName, replaces }`, where `replaces` is whether `projects` already holds `projectId`. Nothing has been written yet, so the UI can ask before replacing.
    *   **`runImport(prepared)`** does three things in order:
        1.  Calls `importProject`, sending the resolved Custom Attributes as `{ id, formula }` and the Groups as `{ id, filters }`.
        2.  Deletes the old Project's rows: `removeCustomAttributesForProject`, `removeGroupsForProject`, `deleteSavedComparisonsForProject`, `deleteComparison`, the two `deleteSettings`, and the `projects` row through a row-only delete in `projects.svelte.ts`.
        3.  Builds rows with `importedRows`, then calls `addProject`, `addCustomAttributes` and `addGroups`.

        It returns the Project and the counts for the success message.
    *   **`importErrorMessage(error)`** maps an error to `{ sentence, detail }`, using the three sentences in the Technical Plan. A `ManifestError` of kind `version` gets "Update ProDiff and try again."

##### 22. `src/lib/event-log/state/projects.svelte.ts` (Modify)

*   **Type / Scope**: state module.
*   **Proposed Changes**: add `forgetProjectRow(id)`, which deletes the `projects` row and removes it from `projects` without touching files. `removeProject` is unchanged.

##### 23. `src/lib/project-import/components/import-study-project.svelte` (Create)

*   **Type / Scope**: Svelte component.
*   **Proposed Changes**:
    *   A Settings section titled "Study" with the "Import study Project" button and a secondary "Pick a folder instead" button. Both use `open` from `@tauri-apps/plugin-dialog`: the first with `filters: [{ name: "Study file", extensions: ["zip"] }]`, the second with `directory: true`.
    *   After `prepareImport`, if `replaces` is true, show a shadcn `AlertDialog` that names the Project and says the participant's changes to it will be discarded.
    *   While `runImport` runs, show a blocking `Dialog` with a spinner and "Importing the study Project. This can take a minute." Both buttons stay disabled.
    *   On success, show the Project name, its case, event and Group counts, and a link to open it.
    *   On failure, show the sentence, plus the detail in a read-only, selectable block with a copy button.
    *   Copy has no em dashes. Sizing uses `rem`, and icons come from `@lucide/svelte`.

##### 24. `src/routes/app/settings/+page.svelte` (Modify)

*   **Type / Scope**: route.
*   **Proposed Changes**: render `<ImportStudyProject />` after `<ResetTours />`. No other logic goes in the route.

##### 25. `src/lib/project-import/tests/utils/import.test.ts` (Create)

*   **Type / Scope**: Vitest, with the invokers and state modules mocked as in `sample-project/tests/utils/create.test.ts`.
*   **Proposed Changes**: cover
    *   `prepareImport` reports `replaces` only when the id exists;
    *   `runImport` deletes every row kind before inserting and sends `fx_` columns in Filters;
    *   a rejected `importProject` writes no rows;
    *   `importErrorMessage` maps a version error and a Rust error string to the right sentences.

#### Step 5: docs and the decision record

##### 26. `docs/adr/0021-import-a-study-project-from-a-bundle.md` (Create)

*   **Type / Scope**: ADR.
*   **Proposed Changes**: record that a study Project ships as a zip of CSV plus seed manifest, imported through the code `pnpm seed` runs. Cover:
    *   that the manifest refers to Custom Attributes and earlier Groups by name;
    *   why the CSV is not bundled in the installer;
    *   why export, Saved Comparisons and a minimum app version are left out;
    *   the accepted gap between the file swap and the row writes;
    *   that the feature is removed after the study.

##### 27. `scripts/CLAUDE.md` (Modify)

*   **Type / Scope**: docs.
*   **Proposed Changes**: replace the manifest paragraph:
    *   add `formatVersion`;
    *   a Filter `column` may name a Custom Attribute;
    *   the manifest types and resolution live in `src/lib/project-import/`;
    *   the same manifest, zipped with its CSV, is what "Import study Project" reads.

##### 28. `src-tauri/CLAUDE.md` (Modify)

*   **Type / Scope**: docs.
*   **Proposed Changes**: add a `project_import` row to the module table: the build shared by `seed-project` and the study import, and opening a bundle. Update the `bin/seed-project` row to say it wraps `project_import::build`.

##### 29. `CLAUDE.md` (Modify)

*   **Type / Scope**: docs.
*   **Proposed Changes**: add one sentence in the dependency paragraph: `project-import` sits above `event-log`, `filters`, `groups`, `custom-attributes`, `tree` and `dfg`, and only the Settings route imports it.

### Verification Plan

*   **Compilation/Build**: `pnpm check`; `cargo build` in `src-tauri`; `pnpm tauri build` once at the end.
*   **Unit Tests**: `pnpm test` (manifest and import tests); `cargo test` in `src-tauri` (`project_import` and `bundle` tests, and the existing importer tests unchanged).
*   **Static Analysis & Linting**: `pnpm check`, plus `cargo clippy` with no new warnings.
*   **Seed parity**: `pnpm seed road_traffic_fine_10k` before and after Step 2 gives the same Project counts and Group stats.
*   **Manual, author's machine**: zip the real study CSV with its manifest. Then:
    *   run `pnpm seed` on the folder;
    *   import the zip in `pnpm tauri dev`;
    *   import the unzipped folder;
    *   import the zip again and confirm the replace;
    *   import a renamed `.txt` and check the error.

    The seeded and imported Projects show the same counts and Group sizes.
*   **Manual, release build**: one import on a Windows laptop and one on macOS from the published release, before the study. Record the counts in the participant handout.

--------------------------------------------------------------------------------

*Drafted with EGM*
