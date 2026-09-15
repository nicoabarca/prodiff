# Run e2e tests through an embedded WebDriver server in a separate e2e build

The app needs end-to-end tests that drive the real desktop binary: the Svelte frontend, `invoke`, and the Rust backend with its Polars, Parquet and SQLite work, all together. Tauri's recommended harness is WebdriverIO. The official route is `tauri-driver`, but it only runs on Linux and Windows, because macOS has no WebDriver for WKWebView, and development happens on macOS. CrabNebula's driver covers macOS but needs a paid API key.

So the suite uses `@wdio/tauri-service` with the **embedded** provider. `tauri-plugin-wdio-webdriver` runs a W3C WebDriver server inside the app, on the port the service hands it through `TAURI_WEBDRIVER_PORT`. It works the same on all three platforms, so a later CI job needs no extra driver.

A WebDriver server has no place in a shipped app. The plugin is an optional dependency behind a Cargo feature, `e2e`, registered under `#[cfg(feature = "e2e")]`. `pnpm tauri build` never enables it. Its `wdio-webdriver:default` permission grants no commands, so it is left out of `capabilities/default.json`, which would otherwise fail to resolve in builds without the feature.

E2E binaries are built with `CARGO_TARGET_DIR=src-tauri/target/e2e` and the identifier `com.nicoabarca.compare.e2e`. The separate target dir keeps feature and non-feature builds from overwriting each other in `target/debug` and `target/release`, so "the e2e binary exists" really means a binary with the plugin in it. The separate identifier gives the suite its own app data dir, which is wiped before each spec file, so specs never see the developer's Projects and do not depend on each other's leftovers.

The default target is the debug binary, built only when it is missing. Release is opt-in through `E2E_TARGET=release` and rebuilt on every run, because it is chosen on purpose and its compile time is acceptable there. The tests live in a root `e2e/` directory: they exercise the whole app rather than either half, and keeping them out of `src/` and `src-tauri/` keeps them away from `svelte-check`'s browser types, Vitest's `src/**` glob and the Rust crate.

**Consequence:** `@wdio/tauri-service` polls window focus before element lookups through `tauri-plugin-wdio`, which is not installed because the specs call the real backend and mock nothing. Each poll would wait out a 5 second timeout, so the `before` hook issues an explicit `switchToWindow`, which the service reads as the user choosing a window and stops polling. The app has one window, so nothing is lost.

**Cost accepted:** `pnpm e2e` runs whatever debug binary is on disk. After a code change it runs stale code until `pnpm e2e:build` rebuilds it. Specs run one at a time, since every worker would share the one e2e app data dir.
