// Mutation relay for the Show Details dashboard — same BFF pattern as
// /projects/sync: the browser only ever talks to the SvelteKit server.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/server/api';
import type { MerchCount, ShowDoc } from '$lib/projects/data';
import { merchSold } from '$lib/projects/shows';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const patch = await request.json();
	return json(await api.update('events', params.id, patch));
};

// Push a settled merch count into inventory: lines that came from the catalog
// have their stock drawn down by what sold, lines typed at the show become new
// merch records (counting your first show is how the catalog fills up).
//
// Guarded by a `merchApplied` stamp on the show doc — re-posting is a no-op
// rather than a second subtraction, so a double-click or a stale tab can't
// quietly halve the inventory.
export const POST: RequestHandler = async ({ params, request }) => {
	const { action } = await request.json();
	if (action !== 'apply-merch') return json({ error: 'unknown action' }, { status: 400 });

	const ev = await api.get('events', params.id);
	const doc = (ev.show ?? {}) as ShowDoc;
	if (doc.merchApplied) {
		return json({ ok: false, reason: 'already-applied', at: doc.merchApplied }, { status: 409 });
	}
	const rows: MerchCount[] = doc.merch ?? [];
	if (!rows.length) return json({ ok: false, reason: 'nothing-to-apply' }, { status: 400 });

	const project_id = (ev.project_id as number | null) ?? null;
	const updated: MerchCount[] = [];
	let created = 0;
	let drawnDown = 0;

	for (const line of rows) {
		const sold = merchSold(line);
		if (line.itemId != null) {
			const item = await api.get('merch', line.itemId).catch(() => null);
			if (item) {
				// Stock can legitimately go to zero but never below — a count that
				// exceeds what inventory thought it had means inventory was wrong,
				// and clamping keeps the record readable rather than negative.
				const next = Math.max(0, Number(item.stock ?? 0) - sold);
				await api.update('merch', line.itemId, { stock: next });
				drawnDown += sold;
			}
			updated.push(line);
		} else {
			// New to the catalog: what came back from the show is what's left.
			const rec = await api.create('merch', {
				name: line.name,
				price: line.price || null,
				stock: line.out ?? 0,
				project_id
			});
			created += 1;
			updated.push({ ...line, itemId: rec.id as number });
		}
	}

	const show: ShowDoc = { ...doc, merch: updated, merchApplied: new Date().toISOString() };
	await api.update('events', params.id, { show });
	return json({ ok: true, created, drawnDown, appliedAt: show.merchApplied });
};
