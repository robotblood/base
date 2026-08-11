<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/chrome/PageHeader.svelte';
	// relTime, not admin's ago(): these stamps come back timezone-naive UTC,
	// and relTime is the helper that pins them (see $lib/format).
	import { relTime } from '$lib/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// One pending confirmation at a time, tagged by kind so an archive id and
	// a revision id can never collide.
	let confirm = $state<string | null>(null);

	const clear = () => (confirm = null);
</script>

<svelte:head><title>base — admin · archive</title></svelte:head>

<div class="px-9 pb-14 pt-7">
	<PageHeader
		code="SYS"
		title="Archive"
		subtitle={`${data.archives.length} archived ${data.archives.length === 1 ? 'table' : 'tables'} · ${data.trash.length} in the trash · ${data.orphans.length} leftover ${data.orphans.length === 1 ? 'field' : 'fields'}`}
	/>

	{#if form?.message}
		<p class="mt-4 max-w-3xl rounded-[9px] border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-[13px] text-destructive">
			{form.message}
		</p>
	{/if}

	<div class="mt-6 max-w-3xl">
		<!-- ============ Archived tables ============ -->
		<div class="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
			Archived tables
		</div>
		<p class="mb-4 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			A deleted table with data lands here whole — schema and rows in one snapshot. Restore
			rebuilds it exactly as it was (sidebar and all); purge is the only true delete in the
			system. Deleting an empty table skips the archive entirely.
		</p>

		<section class="mb-8 overflow-hidden rounded-[12px] border bg-card">
			<div class="divide-y">
				{#each data.archives as a (a.id)}
					<div class="flex items-center justify-between gap-3 px-5 py-2.5">
						<span class="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
						<span class="font-mono text-[11px] text-muted-foreground"
							>/{a.key} · {a.row_count} rows · {relTime(a.archived_at)}</span
						>
						<form method="POST" action="?/restoreArchive" use:enhance>
							<input type="hidden" name="id" value={a.id} />
							<button
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
								>RESTORE</button
							>
						</form>
						{#if confirm === `archive-${a.id}`}
							<form
								method="POST"
								action="?/purgeArchive"
								use:enhance={() =>
									async ({ update }) => {
										clear();
										await update();
									}}
							>
								<input type="hidden" name="id" value={a.id} />
								<button
									class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
									title="This is the only true delete — {a.row_count} rows, gone for good"
									>PURGE {a.row_count} ROWS?</button
								>
							</form>
							<button
								onclick={clear}
								class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
								>keep</button
							>
						{:else}
							<button
								onclick={() => (confirm = `archive-${a.id}`)}
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
								>PURGE</button
							>
						{/if}
					</div>
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						Nothing archived — deleted tables with data will wait here.
					</p>
				{/each}
			</div>
		</section>

		<!-- ============ Trash: deleted records ============ -->
		<div class="mb-2 flex items-center justify-between">
			<span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
				>Trash — deleted records</span
			>
			{#if data.trash.length > 0}
				{#if confirm === 'empty-trash'}
					<span class="flex items-center gap-2">
						<form
							method="POST"
							action="?/emptyTrash"
							use:enhance={() =>
								async ({ update }) => {
									clear();
									await update();
								}}
						>
							<button
								class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
								>EMPTY {data.trash.length} FOR GOOD?</button
							>
						</form>
						<button
							onclick={clear}
							class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
							>keep</button
						>
					</span>
				{:else}
					<button
						onclick={() => (confirm = 'empty-trash')}
						class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
						>EMPTY TRASH</button
					>
				{/if}
			{/if}
		</div>
		<p class="mb-4 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			Every deleted record — from any module or custom table — waits here with its edit
			history. Restore puts it back under its old id, links intact. The trash empties itself:
			entries older than 90 days are swept automatically.
		</p>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="divide-y">
				{#each data.trash as t (t.revision_id)}
					<div class="flex items-center justify-between gap-3 px-5 py-2.5">
						<span class="min-w-0 flex-1 truncate text-sm">{t.title}</span>
						<span class="font-mono text-[11px] text-muted-foreground"
							>{data.labels[t.module] ?? t.module} · {relTime(t.deleted_at)}{t.history
								? ` · ${t.history} revisions`
								: ''}</span
						>
						<form method="POST" action="?/restoreRecord" use:enhance>
							<input type="hidden" name="revision_id" value={t.revision_id} />
							<button
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
								>RESTORE</button
							>
						</form>
						{#if confirm === `record-${t.revision_id}`}
							<form
								method="POST"
								action="?/purgeRecord"
								use:enhance={() =>
									async ({ update }) => {
										clear();
										await update();
									}}
							>
								<input type="hidden" name="revision_id" value={t.revision_id} />
								<button
									class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
									>GONE FOR GOOD?</button
								>
							</form>
							<button
								onclick={clear}
								class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
								>keep</button
							>
						{:else}
							<button
								onclick={() => (confirm = `record-${t.revision_id}`)}
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
								>PURGE</button
							>
						{/if}
					</div>
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						Trash is empty — deleted records will wait here for 90 days.
					</p>
				{/each}
			</div>
		</section>

		<!-- ============ Leftover field values ============ -->
		<div class="mb-2 mt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
			Leftover field values
		</div>
		<p class="mb-4 max-w-prose text-[13.5px] leading-relaxed text-muted-foreground">
			Removing a field from a table deletes only the field — the values stay in the rows,
			invisible. Restore re-adds the field and they reappear; purge strips them for good. A
			field removed with nothing in it leaves nothing, so only real data shows up here.
		</p>

		<section class="overflow-hidden rounded-[12px] border bg-card">
			<div class="divide-y">
				{#each data.orphans as o (`${o.module}/${o.key}`)}
					<div class="flex items-center justify-between gap-3 px-5 py-2.5">
						<span class="min-w-0 flex-1 truncate text-sm">
							<span class="font-semibold">{data.labels[o.module] ?? o.module}</span>
							<span class="ml-1.5 font-mono text-[12px] text-muted-foreground">.{o.key}</span>
						</span>
						<span
							class="min-w-0 max-w-[220px] truncate font-mono text-[11px] text-muted-foreground/70"
							title={o.sample}>“{o.sample}”</span
						>
						<span class="font-mono text-[11px] text-muted-foreground"
							>{o.rows} {o.rows === 1 ? 'row' : 'rows'}</span
						>
						{#if o.restorable}
							<form method="POST" action="?/restoreField" use:enhance>
								<input type="hidden" name="module" value={o.module} />
								<input type="hidden" name="key" value={o.key} />
								<button
									class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-ring/40 hover:text-foreground/80"
									title="Re-adds the field to {data.labels[o.module] ?? o.module}; the values reappear"
									>RESTORE FIELD</button
								>
							</form>
						{:else}
							<span
								class="font-mono text-[9px] uppercase text-muted-foreground/60"
								title="'{o.key}' now matches a real column, so the field can't come back — purge only"
								>shadowed</span
							>
						{/if}
						{#if confirm === `field-${o.module}/${o.key}`}
							<form
								method="POST"
								action="?/purgeField"
								use:enhance={() =>
									async ({ update }) => {
										clear();
										await update();
									}}
							>
								<input type="hidden" name="module" value={o.module} />
								<input type="hidden" name="key" value={o.key} />
								<button
									class="cursor-pointer rounded-[6px] bg-destructive px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-white hover:opacity-90"
									>STRIP {o.rows} {o.rows === 1 ? 'ROW' : 'ROWS'}?</button
								>
							</form>
							<button
								onclick={clear}
								class="cursor-pointer font-mono text-[9px] text-muted-foreground hover:text-foreground/80"
								>keep</button
							>
						{:else}
							<button
								onclick={() => (confirm = `field-${o.module}/${o.key}`)}
								class="cursor-pointer rounded-[6px] border px-2 py-1 font-mono text-[9px] tracking-[0.06em] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
								>PURGE</button
							>
						{/if}
					</div>
				{:else}
					<p class="px-5 py-3.5 font-mono text-xs text-muted-foreground">
						No leftovers — every value in every row has a field to show it.
					</p>
				{/each}
			</div>
		</section>
	</div>
</div>
