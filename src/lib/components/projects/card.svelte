<script lang="ts">
	import type { Project } from '$lib/types';
	import * as Card from '$lib/components/ui/card/index.js';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import Clock from '@lucide/svelte/icons/clock';

	let { project, onOpen }: { project: Project; onOpen: (project: Project) => void } = $props();
</script>

<li>
	<button type="button" class="block h-full w-full text-left" onclick={() => onOpen(project)}>
		<Card.Root class="h-full transition-colors hover:bg-accent">
			<Card.Header>
				<Card.Title class="flex items-start justify-between font-heading text-base">
					{project.name}
					<ArrowRight class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				</Card.Title>
				<Card.Description class="flex items-center gap-1.5">
					<FileText class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span class="truncate">{project.fileName}</span>
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
					<div>
						<dt class="text-[0.625rem] uppercase tracking-widest text-muted-foreground">Cases</dt>
						<dd class="font-medium text-card-foreground">{project.cases.toLocaleString()}</dd>
					</div>
					<div>
						<dt class="text-[0.625rem] uppercase tracking-widest text-muted-foreground">Events</dt>
						<dd class="font-medium text-card-foreground">{project.events.toLocaleString()}</dd>
					</div>
					<div>
						<dt class="text-[0.625rem] uppercase tracking-widest text-muted-foreground">Activities</dt>
						<dd class="font-medium text-card-foreground">{project.activities.toLocaleString()}</dd>
					</div>
					<div>
						<dt class="text-[0.625rem] uppercase tracking-widest text-muted-foreground">Variants</dt>
						<dd class="font-medium text-card-foreground">{project.variants.toLocaleString()}</dd>
					</div>
				</dl>
			</Card.Content>
			<Card.Footer class="flex flex-col items-start gap-1.5 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
				<span class="flex items-center gap-1.5">
					<CalendarRange class="h-3 w-3 shrink-0" aria-hidden="true" />
					{project.timespan}
				</span>
				<span class="flex items-center gap-1.5">
					<Clock class="h-3 w-3 shrink-0" aria-hidden="true" />
					Added {project.createdAt}
				</span>
			</Card.Footer>
		</Card.Root>
	</button>
</li>
