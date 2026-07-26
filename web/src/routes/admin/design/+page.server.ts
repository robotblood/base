import { api } from '$lib/server/api';
import { withDefaults } from '$lib/design/tokens';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const stored = await api.getSetting('design').catch(() => null);
	return {
		config: withDefaults(stored),
		// Whether anything has actually been saved, so the page can say "using
		// the built-in defaults" rather than implying an edit that never happened.
		saved: Boolean(stored && Object.keys(stored).length > 0)
	};
};
