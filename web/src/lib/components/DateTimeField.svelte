<script lang="ts">
	// Date picker + time input, combined into one hidden "YYYY-MM-DDTHH:MM" value
	// that the form action coerces to a datetime (seconds appended server-side).
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
	let time = $state<string>(untrack(() => (value ? String(value).slice(11, 16) : '')));
	let open = $state(false);

	const hidden = $derived(selected ? `${selected.toString()}T${time || '00:00'}` : '');
	const timeCls =
		'border-input h-8 w-[7.5rem] shrink-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
</script>

<input type="hidden" {name} value={hidden} />
<div class="flex gap-2">
	<Popover.Root bind:open>
		<Popover.Trigger class="min-w-0 flex-1">
			{#snippet child({ props })}
				<Button
					{...props}
					{id}
					variant="outline"
					class={cn('w-full justify-start text-left font-normal', !selected && 'text-muted-foreground')}
				>
					<CalendarIcon class="mr-2 size-4 shrink-0" />
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
	<input type="time" bind:value={time} class={timeCls} aria-label="Time" />
</div>
