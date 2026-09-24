# Dev-only inspectors live in their own domain behind lazy seams

Debugging a comparison view usually means asking what Rust actually sent. For the directed tree, the payload goes through `toFlow` before anything is drawn, so the canvas shows derived figures, and reading the raw `ResponseDirectedTree` meant adding a temporary `console.log` and removing it afterwards.

Dev tools now live in `src/lib/devtools/`, one folder per view (`devtools/tree/`). The folder may import from any domain, and no domain imports it. Prod code reaches it through one seam per view, in the route that composes the view:

```svelte
{#if import.meta.env.DEV}
  {#await import("$lib/devtools/tree/components/tree-inspector.svelte") then { default: TreeInspector }}
    <TreeInspector tree={built.tree} />
  {/await}
{/if}
```

`import.meta.env.DEV` is replaced by a literal at build time. `vite build` (and so `tauri build` and the e2e binaries) sees `{#if false}` and drops the dynamic import, so the inspector's chunk is never emitted. No environment variable or runtime setting can switch it on in a shipped build.

A dev tool reads the state its view already keeps (`built`, `selected`) and does not add anything to prod components. The tree inspector shows one node's data by following the existing node selection, so the node, canvas and flow code carry no dev branches. The inspector is a non-modal floating window, draggable by its header and resizable from its corner, so the canvas stays clickable and the Node tab follows the selection live. It also assigns the payload to `window.__tree` for use from the console.

**Consequence:** removing every dev tool means deleting `src/lib/devtools/` and its seams. Each seam is visible in its route, so adding a dev tool to another view follows the same shape. The seam does add a few lines to routes that are already marked as needing cleanup.
