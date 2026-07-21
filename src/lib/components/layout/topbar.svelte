<script lang="ts">
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Project } from '$lib/types';
	import Home from '@lucide/svelte/icons/home';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import Filter from '@lucide/svelte/icons/filter';

	type ProjectView = 'process-map' | 'variants' | 'statistics' | 'data';

	const viewLabels: Record<ProjectView, string> = {
		'process-map': 'Process map',
		variants: 'Variants',
		statistics: 'Statistics',
		data: 'Data table'
	};

	let { project, projectView = 'process-map' }: { project: Project; projectView?: ProjectView } =
		$props();
</script>

<header class="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/app/projects" class="flex items-center gap-1.5">
					<Home class="h-3.5 w-3.5" aria-hidden="true" />
					Projects
				</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{project.name}</Breadcrumb.Page>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{viewLabels[projectView]}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<div class="flex items-center gap-2">
		<Button variant="outline" size="sm">
			<CalendarRange data-icon="inline-start" />
			Time range: All time
		</Button>
		<Button variant="outline" size="sm">
			<Filter data-icon="inline-start" />
			Filters: None
		</Button>
		<Button size="sm">Apply</Button>
	</div>
</header>
