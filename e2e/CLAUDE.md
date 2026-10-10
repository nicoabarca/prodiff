# e2e

`pnpm e2e` runs every WebdriverIO spec in `e2e/specs/` against the debug e2e binary, building it first only if it is missing. `pnpm e2e:release` does the same against a release binary it rebuilds on every run. `pnpm e2e:build` forces a debug rebuild; run it after changing Rust or frontend code, since `pnpm e2e` never notices a stale binary. Narrow any run with `--spec e2e/specs/<file>.e2e.ts` for one file or `--mochaOpts.grep "<test name>"` for one test.

E2E binaries build with the `e2e` Cargo feature (which registers `tauri-plugin-wdio-webdriver`), the identifier `com.nicoabarca.prodiff.e2e`, and `CARGO_TARGET_DIR=src-tauri/target/e2e`, so they never share data or build output with the dev app. That identifier's app data dir is wiped once per run, before the app launches; spec files in a run share one app process and its data. Failed tests leave a screenshot in `e2e/.artifacts/` (gitignored). See `docs/adr/0007`.
