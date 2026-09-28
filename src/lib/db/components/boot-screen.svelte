<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  import Logo from "$lib/components/layout/logo.svelte";
  import { boot } from "$lib/db/state/boot.svelte";
  import { cn } from "$lib/utils";
  import Check from "@lucide/svelte/icons/check";
  import CircleDashed from "@lucide/svelte/icons/circle-dashed";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  let { projectCount }: { projectCount: number } = $props();

  const STAGES = ["opening", "migrating", "loading", "ready"] as const;

  let version = $state<string | null>(null);
  getVersion()
    .then((value) => (version = value))
    .catch(() => {});

  const current = $derived(STAGES.indexOf(boot.stage));

  const migrationNote = $derived.by(() => {
    const { done, pending } = boot.migrations;
    if (pending === 0) return "Up to date";
    return `${done} of ${pending} ${pending === 1 ? "migration" : "migrations"}`;
  });

  const steps = $derived([
    { label: "Opening your data", note: "prodiff.db" },
    {
      label: version ? `Updating to version ${version}` : "Updating your data",
      note: migrationNote
    },
    {
      label: "Loading projects",
      note: `${projectCount} ${projectCount === 1 ? "project" : "projects"}`
    }
  ]);

  const percent = $derived.by(() => {
    if (boot.stage === "opening") return 8;
    if (boot.stage === "migrating") {
      const { done, pending } = boot.migrations;
      return Math.round(34 + (38 * done) / Math.max(pending, 1));
    }
    return boot.stage === "loading" ? 72 : 100;
  });

  const label = $derived(current < steps.length ? `${steps[current].label}…` : "Ready");

  // A launch that finishes within a moment shows nothing, so the screen never flashes.
  let visible = $state(false);
  $effect(() => {
    const timer = setTimeout(() => (visible = true), 200);
    return () => clearTimeout(timer);
  });
</script>

<div class="bg-background relative flex h-screen flex-col items-center justify-center">
  {#if visible}
    <div class="flex w-80 flex-col gap-7">
      <div class="flex items-center gap-2.5">
        <Logo class="size-10" />
        <span class="font-heading text-xl font-bold tracking-tight uppercase">ProDiff</span>
      </div>

      <div class="flex flex-col gap-2.5">
        <div
          class="bg-muted h-1 overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Starting ProDiff"
        >
          <div
            class="bg-primary h-full transition-[width] duration-500 ease-out"
            style:width="{percent}%"
          ></div>
        </div>
        <div class="flex justify-between text-xs">
          <span class="font-medium">{label}</span>
          <span class="text-muted-foreground tabular-nums">{percent}%</span>
        </div>
      </div>

      <ol class="flex flex-col gap-2 text-xs">
        {#each steps as step, index (step.label)}
          {@const done = index < current}
          {@const active = index === current}
          <li class={cn("flex items-center gap-2", !done && !active && "text-muted-foreground")}>
            {#if done}
              <Check class="text-primary size-3.5 shrink-0" aria-hidden="true" />
            {:else if active}
              <LoaderCircle class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            {:else}
              <CircleDashed class="text-muted-foreground/60 size-3.5 shrink-0" aria-hidden="true" />
            {/if}
            <span>{step.label}</span>
            {#if done}
              <span class="text-muted-foreground ml-auto text-[0.6875rem]">{step.note}</span>
            {/if}
          </li>
        {/each}
      </ol>
    </div>

    {#if version}
      <p class="text-muted-foreground absolute inset-x-0 bottom-6 text-center text-[0.6875rem]">
        Version {version}
      </p>
    {/if}
  {/if}
</div>
