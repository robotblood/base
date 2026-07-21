<script lang="ts">
	// A date picker (calendar in a popover) that submits like a native field:
	// a hidden <input name> carries the ISO "YYYY-MM-DD" value into the form action.
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { DateFormatter, getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { untrack } from 'svelte';

	let {
		name,
		value = undefined,
		id = undefined
	}: { name: string; value?: string | null; id?: string } = $props();

	const df = new DateFormatter('en-US', { dateStyle: 'medium' });

	function parse(v?: string | null): DateValue | undefined {
		if (!v) return undefined;
		try {
			return parseDate(String(v).slice(0, 10));
		} catch {
			return undefined;
		}
	}

	let selected = $state<DateValue | undefined>(untrack(() => parse(value)));
	let open = $state(false);
</script>

<input type="hidden" {name} value={selected ? selected.toString() : ''} />
<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				class={cn('w-full justify-start text-left font-normal', !selected && 'text-muted-foreground')}
			>
				<CalendarIcon class="mr-2 size-4" />
				{selected ? df.format(selected.toDate(getLocalTimeZone())) : 'Pick a date'}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar type="single" bind:value={selected} captionLayout="dropdown" onValueChange={() => (open = false)} />
		<div class="border-t p-2">
			<Button
				variant="ghost"
				size="sm"
				class="w-full"
				onclick={() => {
					selected = undefined;
					open = false;
				}}
			>
				Clear
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
