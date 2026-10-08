# A dev-only element picker sends UI context to a Claude Code session

Asking a coding agent to change something on screen meant describing it in words ("the button left of the Variants field in the tree toolbar") and letting the agent search for it. The running app already knows exactly where every element comes from: in dev builds Svelte 5 attaches `__svelte_meta` to each element it creates, with the `file:line:column` of its opening tag and the stack of components it renders inside.

`src/lib/devtools/picker/` turns that into a message. `⌘⇧K` (Ctrl+Shift+K) toggles pick mode: the app's own pointer events and keyboard shortcuts are captured and cancelled, hovering outlines an element with its source location, `↑`/`↓` walk to its parent or back, click selects and opens a popup, and Shift+click adds or removes more elements. Each selected element can be re-targeted to the outermost element of an enclosing file's markup, which is how a whole component is chosen rather than the `<span>` under the pointer. The popup sends one of two kinds of message, and in both the popup only confirms delivery and closes:

- **Ask** is a read-only question. Claude answers in the session.
- **Do** is an instruction. Claude makes the change in the session.

The whole conversation stays in the Claude session; nothing comes back to the app. Every message opens with a line naming its mode and elements (`[ProDiff Ask] button · compare-field.svelte:42`), which Claude repeats at the start of an answer, so the session shows which elements each exchange is about. Each element carries its source location, component chain, CSS selector, identifying attributes, text, box and `outerHTML` (SVG path data collapsed, about 2 KB each, 16 KB for the whole message), plus the route and viewport.

Messages travel through Claude Inbox, a Claude Code channel that lives outside this repository in `~/.claude/channels/inbox/` and is started by the `channels-claude` shell function. It is project-agnostic: each session registers `{ port, token, cwd }` in `~/.claude/channels/inbox/sessions/` and accepts `/send` (fire and forget) and `/ask` (wait for `reply`, which Local File Reviewer uses; the picker only sends). The framing that tells Claude what a ProDiff message is travels inside the message. The webview cannot read the registry, so `scripts/inbox/vite-plugin.ts` bridges it from the dev server at `/__inbox/*`, never exposing a port or token to the page and refusing posts from other origins. It picks the session whose `cwd` is inside this worktree, and offers a list otherwise.

The registry format (`v: 1`) is the contract, so `scripts/inbox/sessions.ts` reads it with its own copy of the reader instead of importing from a folder that teammates and CI do not have. Without the inbox the picker still opens and reports that no session is running.

The picker is mounted through the `import.meta.env.DEV` seam in the root layout, following ADR 0009, and the plugin applies to `vite serve` only, so neither reaches `vite build`, the release bundle or the e2e binaries. Production builds also lack `__svelte_meta`, so the picker would have little to send there.

**Consequences:** the picker depends on Svelte's undocumented dev metadata. If its shape changes, source locations and component chains disappear (the message still carries selector, attributes and HTML) and `utils/context.ts` is the one place to adapt. Sessions must be started with `channels-claude`, which loads a development channel and shows Claude Code's warning at every start.
