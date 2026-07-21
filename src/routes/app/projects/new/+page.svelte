<script lang="ts">
	import { goto } from '$app/navigation';
	import { draftUpload } from '$lib/state/projects.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileUp from '@lucide/svelte/icons/file-up';

	function chooseFile() {
		// ponytail: mock upload, matches the React source (no real file dialog)
		draftUpload.fileName = 'event_log.csv';
		goto('/app/projects/new/mapping');
	}
</script>

<main class="min-h-0 flex-1 overflow-auto mx-auto w-full max-w-2xl px-6 py-10">
	<div class="mb-6">
		<h1 class="font-heading text-xl font-bold tracking-tight">New project</h1>
		<p class="mt-1 text-sm text-muted-foreground text-pretty">
			Upload an event log to analyze. Files are parsed locally and never leave your device.
		</p>
	</div>

	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon"><UploadCloud /></Empty.Media>
			<Empty.Title>Drag and drop your event log</Empty.Title>
			<Empty.Description>CSV or XES · up to 500 MB</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button onclick={chooseFile}>
				<FileUp data-icon="inline-start" />
				Choose file
			</Button>
		</Empty.Content>
	</Empty.Root>

	<div class="mt-4 flex items-center justify-between gap-3">
		<p class="text-xs text-muted-foreground text-pretty">
			After upload you'll map columns to the required process mining fields — a project is
			created once mapping is confirmed.
		</p>
		<Button variant="outline" onclick={() => goto('/app/projects')}>Cancel</Button>
	</div>
</main>
