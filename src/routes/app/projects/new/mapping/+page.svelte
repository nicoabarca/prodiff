<script lang="ts">
	import { goto } from '$app/navigation';
	import { draftUpload, addProject } from '$lib/state/projects.svelte';
	import type { Project } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import Check from '@lucide/svelte/icons/check';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	type Role = 'case' | 'activity' | 'timestamp';

	const roleOrder: Role[] = ['case', 'activity', 'timestamp'];

	const roleMeta: Record<Role, { step: number; label: string; hint: string }> = {
		case: { step: 1, label: 'Case ID', hint: 'Groups events into a single process instance' },
		activity: { step: 2, label: 'Activity', hint: 'The step or action performed' },
		timestamp: { step: 3, label: 'Complete timestamp', hint: 'When the activity finished' }
	};

	const sampleColumns = ['order_id', 'step', 'resource', 'created_at', 'amount', 'channel'] as const;

	const activities = ['Create Order', 'Approve Order', 'Pick Items', 'Ship Order', 'Invoice', 'Receive Payment'];
	const resources = ['a.smith', 'm.lee', 'k.wong', 'j.diaz', 's.novak'];
	const channels = ['web', 'phone', 'partner'];

	function buildRows() {
		const rows: string[][] = [];
		let day = 4;
		for (let i = 0; i < 30; i++) {
			const caseId = 1001 + Math.floor(i / 3);
			const activity = activities[i % activities.length];
			const resource = resources[i % resources.length];
			const hh = String(8 + (i % 9)).padStart(2, '0');
			const mm = String((i * 7) % 60).padStart(2, '0');
			if (i % 3 === 0 && i !== 0) day += 1;
			const date = `2025-01-${String(day).padStart(2, '0')} ${hh}:${mm}`;
			const amount = (80 + ((i * 37) % 900)).toFixed(2);
			const channel = channels[i % channels.length];
			rows.push([String(caseId), activity, resource, date, amount, channel]);
		}
		return rows;
	}

	const fileName = draftUpload.fileName ?? 'event_log.csv';
	const rows = buildRows();

	let assignments = $state<Record<Role, string | null>>({ case: null, activity: null, timestamp: null });
	let activeRole = $state<Role | null>('case');

	const roleByColumn = $derived.by(() => {
		const map: Record<string, Role> = {};
		for (const role of roleOrder) {
			const col = assignments[role];
			if (col) map[col] = role;
		}
		return map;
	});

	const allMapped = $derived(roleOrder.every((r) => assignments[r] !== null));

	function firstUnassigned(next: Record<Role, string | null>): Role | null {
		return roleOrder.find((r) => next[r] === null) ?? null;
	}

	function handleColumnClick(col: string) {
		const existing = roleByColumn[col];
		if (existing) {
			assignments = { ...assignments, [existing]: null };
			activeRole = existing;
			return;
		}
		if (!activeRole) return;
		const next = { ...assignments, [activeRole]: col };
		assignments = next;
		activeRole = firstUnassigned(next);
	}

	function activateRole(role: Role) {
		assignments = { ...assignments, [role]: null };
		activeRole = role;
	}

	function reset() {
		assignments = { case: null, activity: null, timestamp: null };
		activeRole = 'case';
	}

	function back() {
		draftUpload.fileName = null;
		goto('/app/projects/new');
	}

	function confirm() {
		const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
		const project: Project = {
			id: `p-${Date.now()}`,
			name: name.charAt(0).toUpperCase() + name.slice(1),
			fileName,
			events: 24680,
			cases: 2140,
			activities: 11,
			variants: 73,
			createdAt: new Date().toISOString().slice(0, 10),
			timespan: 'Jan 2025 – Jul 2026'
		};
		addProject(project);
		draftUpload.fileName = null;
		goto(`/app/projects/${project.id}`);
	}
</script>

<main class="min-h-0 flex-1 overflow-auto mx-auto w-full max-w-6xl px-6 py-8">
	<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="font-heading text-xl font-bold tracking-tight">Map columns</h1>
			<p class="mt-1 text-sm text-muted-foreground text-pretty">
				Click the columns in <span class="font-mono text-foreground">{fileName}</span> to assign the
				fields required for process mining.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={reset}>
			<RotateCcw data-icon="inline-start" />
			Reset
		</Button>
	</div>

	<div
		class={`mb-4 flex items-center gap-3 border px-4 py-3 text-sm ${
			activeRole ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-card-foreground'
		}`}
	>
		{#if activeRole}
			<span class="flex h-6 w-6 shrink-0 items-center justify-center border border-primary-foreground text-xs font-bold">
				{roleMeta[activeRole].step}
			</span>
			<span class="text-pretty">
				<span class="font-semibold uppercase tracking-wide">Click the {roleMeta[activeRole].label} column</span>
				{' — '}
				{roleMeta[activeRole].hint}
			</span>
		{:else}
			<Check class="h-5 w-5 shrink-0" />
			<span class="font-semibold uppercase tracking-wide">All fields mapped — review the highlights, then confirm</span>
		{/if}
	</div>

	<div class="mb-4 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
		{#each roleOrder as role}
			{@const col = assignments[role]}
			<button
				type="button"
				onclick={() => activateRole(role)}
				class={`flex items-center gap-3 bg-card p-3 text-left hover:bg-accent ${activeRole === role ? 'bg-accent' : ''}`}
			>
				<span
					class={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
						col ? 'border-transparent bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'
					}`}
				>
					{roleMeta[role].step}
				</span>
				<span class="min-w-0">
					<span class="block text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
						{roleMeta[role].label}
					</span>
					<span class="block truncate font-mono text-sm text-card-foreground">{col ?? '—'}</span>
				</span>
			</button>
		{/each}
	</div>

	<div class="min-w-0 border border-border bg-card">
		<div class="flex items-center justify-between border-b border-border px-4 py-2">
			<span class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sample preview</span>
			<span class="text-xs text-muted-foreground">First {rows.length} rows</span>
		</div>
		<div class="overflow-auto max-h-105">
			<Table.Root class="border-collapse">
				<Table.Header class="sticky top-0 z-10">
					<Table.Row class="hover:bg-transparent">
						{#each sampleColumns as col}
							{@const role = roleByColumn[col]}
							<Table.Head class="p-0">
								<button
									type="button"
									onclick={() => handleColumnClick(col)}
									class={`flex w-full items-center gap-2 whitespace-nowrap border-b border-border px-3 py-2 text-left font-mono text-xs transition-colors ${
										role ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
									}`}
								>
									{#if role}
										<span class="flex h-4 w-4 shrink-0 items-center justify-center border border-primary-foreground text-[0.625rem] font-bold">
											{roleMeta[role].step}
										</span>
									{/if}
									<span class="flex flex-col">
										<span>{col}</span>
										{#if role}
											<span class="text-[0.625rem] font-semibold uppercase tracking-wide opacity-90">
												{roleMeta[role].label}
											</span>
										{/if}
									</span>
								</button>
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as row}
						<Table.Row>
							{#each row as cell, j}
								{@const mapped = !!roleByColumn[sampleColumns[j]]}
								<Table.Cell
									class={`whitespace-nowrap px-3 py-1.5 font-mono text-xs ${
										mapped ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
									}`}
								>
									{cell}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</div>

	<div class="mt-5 flex items-center justify-between gap-3">
		<Button variant="outline" onclick={back}>Back</Button>
		<Button disabled={!allMapped} onclick={confirm}>Confirm mapping</Button>
	</div>
</main>
