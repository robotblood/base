import { redirect } from '@sveltejs/kit';
import { ADMIN_SECTIONS } from '$lib/admin';
import type { PageServerLoad } from './$types';

// /admin has no page of its own — it opens on the first registered section.
export const load: PageServerLoad = async () => {
	redirect(307, ADMIN_SECTIONS[0].href);
};
