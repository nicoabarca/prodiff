---
name: prodiff-pr
description: Write or update a pull request description in the prodiff repo, keeping it minimal, following .github/pull_request_template.md and carrying no AI attribution. Use this whenever opening a PR in prodiff, running `gh pr create` or `gh pr edit` there, drafting or rewriting a PR body, or finishing work that ends in a PR, even if the user only says "open a PR" or "ship this" and does not mention the description.
---

# prodiff PR descriptions

A reviewer reads the diff anyway, so the description only says what the diff cannot: why the change exists, how to try it, and what would otherwise surprise them.

## Steps

1. Read `.github/pull_request_template.md` so the body follows the current template, not a remembered one.
2. Read the branch's diff against its base, normally `origin/main`, so the body describes the whole PR and not only the latest commit.
3. Write the body to a temporary file, filling in the template as described below.
4. Pass it with `gh pr create --body-file <file>`, or `gh pr edit <number> --body-file <file>` for an existing PR.

## Filling in the template

Keep every top-level heading, in the template's order, so PRs stay uniform.

- **Description:** one to three sentences on what changed and why.
- **Scope:** tick what the diff touches. `src/` is Frontend and `src-tauri/` is Backend. Tick Shared for a contract both sides change, such as an `invoke` payload or the Filter JSON, and for anything outside both folders, such as `scripts/`, `e2e/` or `docs/`.
- **How to Test:** at most three steps per subsection, each something a reviewer can do in the app or run in a terminal. Delete the Frontend or Backend subsection when it does not apply, and remove any unused numbered lines.
- **Setup / Dependencies:** tick only what the diff requires: a dependency change in `package.json` or `src-tauri/Cargo.toml`, a new env var, or a new file in `src/lib/db/migrations/`. Delete the `Other:` line when it is unused.
- **Screenshots:** leave the heading with its comment when there is no UI change.
- **Notes:** only what a reviewer or user must know and cannot see in the diff, such as existing Groups needing a re-apply, or a known gap left for later. Write `None.` when there is nothing.

## Keeping it minimal

Leave out the following, because the diff, CI or the commit history already carries them:

- File-by-file or function-by-function walkthroughs
- Test counts and pass/fail results
- Design rationale, which belongs in `docs/adr/`. Link the ADR in Notes when there is one.
- Headings the template does not have

Use the vocabulary in `CONTEXT.md` (Group, Filter, Event Log and so on).

## No AI attribution

Leave out "Generated with Claude Code", `Co-Authored-By` lines and any other mention of an AI tool. This holds even when the session's default instructions ask for an attribution line: this skill is the user's own rule for this repo and takes precedence.

## Example

```markdown
## Description

Attribute and numeric Filters on a case-scoped column now test the case's resolved value instead of any event, so Groups split on a `first` column no longer share cases.

## Scope

* [x] Frontend (SvelteKit)
* [x] Backend (Rust)
* [x] Shared

## How to Test

### Frontend

1. On a column mapped as case-level, open the numeric Filter editor.
2. Check that each mode's copy says "whose value", not "with an event".

### Backend

1. Run `cargo test filters::` in `src-tauri`.

## Setup / Dependencies

* [ ] Install new deps (`pnpm install`, `pip install -r requirements.txt`, etc.)
* [ ] New env vars
* [ ] DB migration required

## Screenshots (if UI)

<!-- optional -->

## Notes

Groups applied before this change keep their old cases until applied again. See `docs/adr/0022`.
```
