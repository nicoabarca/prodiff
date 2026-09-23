# compare

Desktop app built with Tauri, SvelteKit and TypeScript.

## Commands

Install dependencies first with `pnpm install`.

### Development

```bash
pnpm tauri dev          # desktop app on the default port (1420)
pnpm dev:port 1430      # desktop app on another port, with per-branch app data
pnpm dev                # frontend only, in the browser
```

### Build

```bash
pnpm tauri build            # release binary and installers in src-tauri/target/release/bundle
pnpm tauri build --debug    # debug build in src-tauri/target/debug
```

### Seed data

```bash
pnpm seed                                     # seed every log in scripts/seed_log/
pnpm seed road_traffic_fine_10k               # seed one log by its slug
pnpm seed --app-id com.nicoabarca.compare     # seed the app data of `pnpm tauri dev`
pnpm seed --app-data-dir /path/to/app-data    # seed any app data directory
```

By default the seed writes to the current branch's app data (`com.nicoabarca.compare.dev-<branch>`), which is what `pnpm dev:port` opens. Reload the app if it is open. The first run compiles the `seed-project` binary in release mode, which takes a few minutes.

Each seed log is a pair of files in `scripts/seed_log/`: `<slug>.csv` holds the Event Log and `<slug>.json` holds its manifest.

```json
{
  "name": "Road traffic fine 10k (seed)",
  "columns": [
    {
      "name": "Case ID",
      "role": "case_id",
      "scope": "case",
      "caseResolution": "constant",
      "type": "string"
    },
    { "name": "Activity", "role": "activity_name", "scope": "event", "type": "string" }
  ],
  "hiddenColumns": ["Variant"],
  "groups": [
    {
      "name": "Not dismissed",
      "color": "group-2",
      "filters": [
        { "kind": "attribute", "column": "dismissal", "mode": "mandatory", "values": ["NIL"] }
      ]
    }
  ]
}
```

- `columns` is the Column Mapping. It must map every column in the CSV header exactly once.
- `hiddenColumns` lists the columns hidden from the event data table, the Filter editor and the tree's attribute choices.
- `groups` is optional. Each Group is applied in array order, which is also its position. `color` is optional and defaults to the palette color for that position. `filters` is a Filter List in the same JSON the app stores. `case_not_in_group` is not supported.

To add a seed log, drop a new CSV and manifest pair into `scripts/seed_log/`. No code changes are needed.

Seeding a slug again resets its Project: the files are replaced, and its Groups, comparison and tree settings are deleted. If the import or any Group fails, the seed reports the error and leaves the previous Project as it was.

### Frontend tests

```bash
pnpm test                               # run Vitest once
pnpm test:watch                         # watch mode
pnpm test src/lib/filters               # only tests under a path
pnpm check                              # type-check the app and the e2e suite
```

### Rust tests

```bash
cargo test --manifest-path src-tauri/Cargo.toml            # all tests
cargo test --manifest-path src-tauri/Cargo.toml duration   # tests whose name contains "duration"
```

### E2E tests

```bash
pnpm e2e                                          # all specs against the debug e2e binary
pnpm e2e --spec e2e/specs/smoke.e2e.ts            # one spec file
pnpm e2e --mochaOpts.grep "empty state"           # tests whose name matches
pnpm e2e:release                                  # all specs against a freshly built release binary
pnpm e2e:build                                    # force a debug e2e rebuild after code changes
```

`pnpm e2e` builds the debug binary only when it is missing, so run `pnpm e2e:build` after changing Rust or frontend code. See `docs/adr/0007-e2e-tests-with-embedded-webdriver.md`.

### Files the tests create and delete

**Frontend tests** (`pnpm test`) run in jsdom and write nothing outside Vitest's cache in `node_modules/.vite/vitest`.

**Rust tests** (`cargo test`):

| Path                       | What happens                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| `src-tauri/target/debug/`  | Test binaries are compiled here, shared with `pnpm tauri dev`.                   |
| `$TMPDIR/kiara-<name>.csv` | CSV fixtures written by the timestamp parsing tests. Overwritten, never deleted. |

**E2E tests** (`pnpm e2e`, `pnpm e2e:release`, `pnpm e2e:build`):

| Path                                                              | What happens                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/target/e2e/debug/` and `src-tauri/target/e2e/release/` | E2E binaries are built here. Debug is built when missing or on `e2e:build`; release is rebuilt on every `e2e:release`.                                                                                                        |
| `build/` and `.svelte-kit/`                                       | Overwritten by the frontend build that runs before each e2e binary build.                                                                                                                                                     |
| `~/Library/Application Support/com.nicoabarca.compare.e2e/`       | **Deleted at the start of every run**, before the app launches. The app recreates `compare.db` in it (and `projects/` once a spec creates a Project); all spec files in the run share them, and they stay until the next run. |
| `e2e/.artifacts/<suite>-<test>.png`                               | Screenshot saved when a test fails. Never deleted by the suite; gitignored.                                                                                                                                                   |

The e2e suite never touches the app data of `pnpm tauri dev` (`com.nicoabarca.compare`) or of `pnpm dev:port` (`com.nicoabarca.compare.dev-<branch>`).

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
