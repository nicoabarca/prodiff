# Tests

There is no test runner and no `test` script. Each file is a standalone program
that asserts with `node:assert/strict` and exits non-zero on the first failure,
run directly:

```
npx tsx tests/unit/timestamp-format.test.ts
```

Type checking is separate and covers the whole app: `pnpm check`.

## unit/

Pure functions from `src/lib/` — the ones whose output is a value, not a
rendering. This is where a wrong answer is invisible in the UI: a mis-sorted
distribution grid looks exactly like a sorted one, and a timestamp read
month-first looks exactly like one read day-first.

## component/

Svelte components rendered and driven in isolation. Empty for now: it exists so
the first component test has an obvious home rather than landing next to the
unit tests, which need no DOM and no renderer.

There is no end-to-end layer yet. Anything that needs the Tauri window — the
upload wizard end to end, the commands behind `invoke` — is checked by hand.
