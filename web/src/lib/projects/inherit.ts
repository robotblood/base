// Downstream inheritance across the umbrella chain (tour → album → song).
//
// A child shows its parent's value wherever its own is empty, and setting a
// value locally overrides it. Nothing is copied — resolution happens at read
// time, so editing an album updates every song that hasn't overridden it.
//
// What flows: the deadline, credited people, and the folder path. Status,
// health and phases deliberately do not — those are each project's own
// progress, and inheriting them would make a song look finished because its
// album is.
import type { PersonRef, Project } from './data';

// A parent chain should be two or three deep in practice. The cap is a
// backstop against a cycle that slipped past `wouldCycle` (e.g. rows edited
// straight in the database), so a bad link degrades instead of hanging.
const MAX_DEPTH = 20;

/** A resolved value plus where it came from — `from` is unset when the
 *  project supplied it itself. */
export interface Inherited<T> {
	value: T;
	from?: Project;
}

const byId = (all: Project[]) => new Map(all.map((p) => [p.id, p]));

/** Ancestors of a project, nearest first. Stops on a repeat, so a cycle
 *  yields a finite chain rather than looping. */
export function ancestry(p: Project | undefined, all: Project[]): Project[] {
	const index = byId(all);
	const seen = new Set<string>();
	const chain: Project[] = [];
	let cur = p?.parentId ? index.get(p.parentId) : undefined;
	while (cur && !seen.has(cur.id) && chain.length < MAX_DEPTH) {
		seen.add(cur.id);
		chain.push(cur);
		cur = cur.parentId ? index.get(cur.parentId) : undefined;
	}
	return chain;
}

/** Every project beneath this one, at any depth. */
export function descendants(p: Project, all: Project[]): Project[] {
	const out: Project[] = [];
	const queue = [p.id];
	const seen = new Set<string>([p.id]);
	while (queue.length) {
		const id = queue.shift()!;
		for (const c of all) {
			if (c.parentId === id && !seen.has(c.id)) {
				seen.add(c.id);
				out.push(c);
				queue.push(c.id);
			}
		}
	}
	return out;
}

/** Would linking `childId` under `parentId` close a loop? True when the
 *  proposed parent is the child itself or already sits beneath it. */
export function wouldCycle(childId: string, parentId: string, all: Project[]): boolean {
	if (childId === parentId) return true;
	const child = all.find((p) => p.id === childId);
	if (!child) return false;
	return descendants(child, all).some((d) => d.id === parentId);
}

/** First ancestor with a usable value for `field`, else the project's own. */
function resolve(
	p: Project | undefined,
	all: Project[],
	pick: (x: Project) => string | undefined
): Inherited<string> {
	const own = pick(p as Project)?.trim();
	if (own) return { value: own };
	for (const a of ancestry(p, all)) {
		const v = pick(a)?.trim();
		if (v) return { value: v, from: a };
	}
	return { value: '' };
}

/** The deadline a project is actually working to. */
export const inheritedDue = (p: Project | undefined, all: Project[]): Inherited<string> =>
	resolve(p, all, (x) => x.due);

/** The start date, same fallback as the deadline. */
export const inheritedStart = (p: Project | undefined, all: Project[]): Inherited<string> =>
	resolve(p, all, (x) => x.start);

/**
 * Where this project's files live.
 *
 * An absolute path of its own wins, then the folder recorded by the importer,
 * then an ancestor's. A *relative* path resolves under the nearest ancestor
 * that has one, so a song can be `pt1` inside the album's folder without
 * repeating the whole prefix. With no path at all, the ancestor's folder is
 * used directly.
 *
 * The imported `rawPath` deliberately outranks inheritance: the archive
 * projects have real folders recorded only there, and attaching one to an
 * album must not hide its own files behind the album's. This mirrors
 * `recordRoot` in $lib/server/files, which resolves the same order for the
 * endpoints that actually read the disk.
 */
export function inheritedPath(p: Project | undefined, all: Project[]): Inherited<string> {
	const own = p?.path?.trim();
	if (own?.startsWith('/')) return { value: own };
	const imported = p?.rawPath?.trim();
	if (!own && imported?.startsWith('/')) return { value: imported };
	for (const a of ancestry(p, all)) {
		const base = a.path?.trim();
		if (!base?.startsWith('/')) continue;
		const stem = base.replace(/\/+$/, '');
		return own ? { value: `${stem}/${own.replace(/^\/+/, '')}`, from: a } : { value: stem, from: a };
	}
	// No ancestor folder to hang a relative path off — report what we have.
	return own ? { value: own } : { value: '' };
}

/**
 * Credits for a project: its own people plus everyone credited further up.
 * Credits accumulate rather than replace — an album's engineer is on every
 * song, and a song can still add a player of its own.
 *
 * A person already credited locally keeps their local role; ancestors don't
 * override what the project says about itself.
 */
export function inheritedPeople(
	p: Project | undefined,
	all: Project[]
): { person: PersonRef; from?: Project }[] {
	const out: { person: PersonRef; from?: Project }[] = [];
	const seen = new Set<string>();
	const key = (x: PersonRef) => (x.personId ? `#${x.personId}` : x.name.trim().toLowerCase());

	for (const person of p?.people ?? []) {
		const k = key(person);
		if (k && !seen.has(k)) {
			seen.add(k);
			out.push({ person });
		}
	}
	for (const a of ancestry(p, all)) {
		for (const person of a.people ?? []) {
			const k = key(person);
			if (k && !seen.has(k)) {
				seen.add(k);
				out.push({ person, from: a });
			}
		}
	}
	return out;
}
