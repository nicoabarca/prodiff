<script lang="ts">
	import { goto } from '$app/navigation';
	import { projects } from '$lib/state/projects.svelte';
	import type { Project } from '$lib/types';
	import ProjectCard from '$lib/components/projects/card.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Plus from '@lucide/svelte/icons/plus';

	function openProject(project: Project) {
		goto(`/app/projects/${project.id}`);
	}
</script>

<main class="min-h-0 flex-1 overflow-auto mx-auto w-full max-w-5xl px-6 py-10">
	<div class="mb-8 flex items-end justify-between border-b border-border pb-6">
		<div>
			<h1 class="font-heading text-2xl font-bold tracking-tight">Projects</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{projects.length} event log{projects.length === 1 ? '' : 's'} on this device
			</p>
		</div>
		<Button onclick={() => goto('/app/projects/new')}>
			<Plus data-icon="inline-start" />
			New project
		</Button>
	</div>

	<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each projects as project (project.id)}
			<ProjectCard {project} onOpen={openProject} />
		{/each}
	</ul>
</main>
