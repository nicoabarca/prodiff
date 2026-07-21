<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
</script>

<main class="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
	<div class="flex w-full max-w-sm flex-col items-center text-center">
		<div class="flex size-14 items-center justify-center border border-foreground">
			<div class="size-5 bg-primary" aria-hidden="true"></div>
		</div>

		<h1 class="mt-8 text-balance text-4xl font-semibold tracking-tight">Welcome</h1>
		<p class="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
			A quiet place to start. No clutter, no noise — just your work.
		</p>

		<div class="mt-10 flex w-full flex-col">
			<Button size="lg" class="w-full" onclick={() => goto('/app/projects')}>
				Get started
				<ArrowRight data-icon="inline-end" />
			</Button>
			<Button variant="outline" size="lg" class="mt-3 w-full" onclick={() => goto('/app/projects')}>
				Open existing
			</Button>
		</div>

		<p class="mt-10 text-xs uppercase tracking-widest text-muted-foreground">Version 1.0.0</p>
	</div>
</main>
