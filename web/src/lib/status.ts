// Semantic state colours for status dots and bars.
//
// Fixed hex rather than theme tokens, matching the precedent already set by the
// chart colours and the Projects tracker's STAGES: these encode *meaning*
// (idle / working / needs-you / good / finished), and that meaning must not
// invert between light and dark. The values are mid-tone so they read on both
// the Paper and Console backgrounds.
import type { ModuleConfig } from '$lib/types';

export const STATE = {
	idle: '#b0aa9c', // not started, upcoming — present but dormant
	progress: '#c68a1a', // actively being worked (the amber signal family)
	attention: '#b23a26', // blocked, needs attention, overdue
	good: '#2f7d5b', // healthy, submitted, on track
	done: '#3a6ea5', // completed
	muted: '#8a8478' // archived, draft — deliberately receded
} as const;

// The colour for a value of the module's status field, or null when the module
// has no colour vocabulary (so callers can skip the dot entirely rather than
// rendering a grey placeholder).
export function statusColor(mod: ModuleConfig, value: unknown): string | null {
	if (!mod.statusColors) return null;
	const key = value == null ? '' : String(value);
	return mod.statusColors[key] ?? null;
}

// Whether a field is the one `statusColors` describes.
export function isStatusField(mod: ModuleConfig, field: string): boolean {
	return Boolean(mod.statusField && field === mod.statusField && mod.statusColors);
}
