<script lang="ts" module>
  import type { InboxSession } from "$lib/devtools/picker/types";

  // The session picked from the list stays picked while the app is open.
  let chosenId: string | null = null;

  function pickSession(sessions: InboxSession[]): string | null {
    if (chosenId && sessions.some((s) => s.id === chosenId)) return chosenId;
    return sessions.find((s) => s.matches)?.id ?? null;
  }
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import type { PickerMode } from "$lib/devtools/picker/types";
  import { contextOf, crumbsOf, labelOf } from "$lib/devtools/picker/utils/context";
  import { listSessions, send } from "$lib/devtools/picker/utils/inbox";
  import { formatMessage } from "$lib/devtools/picker/utils/message";
  import { storeMode } from "$lib/devtools/picker/utils/mode";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import X from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  let {
    x,
    y,
    elements,
    sending = $bindable(),
    mode = $bindable(),
    onRemove,
    onRetarget,
    onDone
  }: {
    x: number;
    y: number;
    elements: Element[];
    sending: boolean;
    mode: PickerMode;
    onRemove: (index: number) => void;
    onRetarget: (index: number, element: Element) => void;
    onDone: () => void;
  } = $props();

  let text = $state("");
  let sessions = $state<InboxSession[] | null>(null);
  let sessionId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let expanded = $state<number | null>(null);
  let width = $state(0);
  let height = $state(0);
  let textarea = $state<HTMLTextAreaElement | null>(null);

  const MODE_ON =
    "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground";

  const session = $derived(sessions?.find((s) => s.id === sessionId) ?? null);
  const matching = $derived(sessions?.filter((s) => s.matches).length ?? 0);
  const canSend = $derived(!sending && text.trim() !== "" && session !== null && elements.length > 0);

  const left = $derived(Math.max(8, Math.min(x + 12, window.innerWidth - width - 8)));
  const top = $derived(Math.max(8, Math.min(y + 12, window.innerHeight - height - 8)));

  onMount(async () => {
    textarea?.focus();
    sessions = await listSessions();
    sessionId = pickSession(sessions);
  });

  async function submit() {
    if (!canSend || !session) return;
    error = null;
    sending = true;
    try {
      await send(
        session.id,
        formatMessage({
          mode,
          instruction: text,
          elements: elements.map(contextOf),
          route: location.pathname + location.search,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        })
      );
    } catch (cause) {
      error = (cause as Error).message;
      sending = false;
      return;
    }
    toast.success(mode === "ask" ? `Asked ${session.project}. The answer is in the session.` : `Sent to ${session.project}`);
    onDone();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }
</script>

<div
  role="dialog"
  aria-label="Send selected elements to Claude"
  tabindex="-1"
  class="bg-popover text-popover-foreground pointer-events-auto fixed z-2147483647 flex w-[26rem] flex-col gap-2.5 border p-3 text-xs shadow-xl"
  style:left="{left}px"
  style:top="{top}px"
  bind:offsetWidth={width}
  bind:offsetHeight={height}
  onkeydown={onKeydown}
>
  <div class="flex items-center justify-between gap-2">
    <ToggleGroup.Root
      type="single"
      size="sm"
      variant="outline"
      value={mode}
      disabled={sending}
      onValueChange={(value) => {
        if (!value) return;
        mode = value as PickerMode;
        storeMode(mode);
      }}
    >
      <ToggleGroup.Item value="ask" title="⌘⇧A" class={MODE_ON}>Ask</ToggleGroup.Item>
      <ToggleGroup.Item value="do" title="⌘⇧D" class={MODE_ON}>Do</ToggleGroup.Item>
    </ToggleGroup.Root>

    {#if sessions === null}
      <span class="text-muted-foreground">Looking for Claude sessions…</span>
    {:else if sessions.length === 0}
      <span class="text-destructive">No Claude session running</span>
    {:else if matching === 1 && session?.matches}
      <span class="text-muted-foreground truncate" title={session.cwd}>To {session.project}</span>
    {:else}
      <select
        class="border-input min-w-0 flex-1 border bg-transparent px-1.5 py-1 text-xs"
        value={sessionId ?? ""}
        onchange={(event) => {
          sessionId = event.currentTarget.value || null;
          chosenId = sessionId;
        }}
      >
        <option value="" disabled>Pick a Claude session</option>
        {#each sessions as option (option.id)}
          <option value={option.id}>
            {option.project}{option.matches ? "" : " (other folder)"} · {new Date(option.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </option>
        {/each}
      </select>
    {/if}
  </div>

  {#if sessions !== null && matching === 0}
    <p class="text-muted-foreground">
      No Claude session runs in this worktree. Start one here with <code class="font-mono">channels-claude</code>{sessions.length >
      0
        ? ", or pick another session above."
        : "."}
    </p>
  {/if}

  <ul class="flex flex-col gap-1">
    {#each elements as element, i (element)}
      <li class="border">
        <div class="flex items-center gap-1.5 px-1.5 py-1">
          <span class="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-[0.6rem] font-semibold text-white">
            {i + 1}
          </span>
          <button
            type="button"
            class="hover:text-foreground text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-left font-mono"
            disabled={sending}
            onclick={() => (expanded = expanded === i ? null : i)}
          >
            <span class="truncate">{labelOf(element)}</span>
            <ChevronDown class="size-3 shrink-0" />
          </button>
          <button
            type="button"
            aria-label="Remove element {i + 1}"
            class="text-muted-foreground hover:text-foreground"
            disabled={sending}
            onclick={() => {
              expanded = null;
              onRemove(i);
            }}
          >
            <X class="size-3" />
          </button>
        </div>
        {#if expanded === i}
          <ul class="border-t py-0.5">
            {#each crumbsOf(element) as crumb (crumb.element)}
              <li>
                <button
                  type="button"
                  class="hover:bg-muted w-full truncate px-6 py-0.5 text-left font-mono"
                  onclick={() => {
                    expanded = null;
                    onRetarget(i, crumb.element);
                  }}
                >
                  {crumb.label}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>

  <Textarea
    bind:ref={textarea}
    bind:value={text}
    disabled={sending}
    placeholder={mode === "ask" ? "Ask about these elements…" : "What should change?"}
    class="max-h-48"
  />

  {#if error}
    <p class="text-destructive">{error}</p>
  {/if}
  <div class="flex items-center justify-between gap-2">
    <span class="text-muted-foreground">⌘⇧A Ask · ⌘⇧D Do · ⌘↵ send · Esc close</span>
    <Button size="sm" disabled={!canSend} onclick={submit}>
      {#if sending}
        <LoaderCircle data-icon="inline-start" class="animate-spin" />
      {/if}
      {mode === "ask" ? "Ask" : "Send"}
    </Button>
  </div>
</div>
