// Screenshot every page of the running app.
//
//   node scripts/snapshots.mjs [outdir] [--dark] [--viewport]
//
// Defaults to ~/Downloads/snapshots, full-page, light theme. Needs base-web up
// (http://localhost:3000) — it drives the same headless Brave the Playwright
// MCP uses, so nothing extra to install.
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const BROWSER = process.env.BRAVE ?? '/usr/bin/brave-browser';

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const fullPage = !args.includes('--viewport');
const OUT = args.find((a) => !a.startsWith('--')) ?? join(HOME, 'Downloads', 'snapshots');

// Playwright comes from the npx cache the MCP server populated; there's no
// project dependency on it, so find it rather than assume a bare import works.
function loadChromium() {
	// Playwright is CommonJS and its exports object is an EventEmitter, so ESM
	// named-export detection finds nothing on it — require() is the way in.
	const require = createRequire(import.meta.url);
	for (const spec of [
		'playwright',
		...(existsSync(join(HOME, '.npm', '_npx'))
			? readdirSync(join(HOME, '.npm', '_npx')).map((d) =>
					join(HOME, '.npm', '_npx', d, 'node_modules', 'playwright')
				)
			: [])
	]) {
		try {
			const { chromium } = require(spec);
			if (chromium) return chromium;
		} catch {
			/* try the next location */
		}
	}
	throw new Error(
		'playwright not found — run `npx -y playwright@latest --version` once, or set PLAYWRIGHT_DIR'
	);
}

// name -> path. Detail pages use ids resolved at runtime so the set survives
// the data changing underneath it.
async function routes(page) {
	const pick = async (path, where = () => true) => {
		try {
			const res = await page.request.get(`http://127.0.0.1:8000${path}`);
			const rows = await res.json();
			return (Array.isArray(rows) ? rows : []).find(where)?.id ?? null;
		} catch {
			return null;
		}
	};
	// /shows/<id> only renders performances, so don't take whatever event
	// happens to sort first — the table is mostly notes-derived entries.
	const show = await pick('/events', (e) => e.kind === 'performance');
	// A note with a real body makes a better example than an empty stub.
	const note = await pick('/notes', (n) => (n.body ?? '').length > 400);
	const todo = await pick('/todos', (t) => t.due);

	return [
		['00-overview', '/'],
		['01-todos', '/todos'],
		['02-notes', '/notes'],
		['03-calendar', '/calendar'],
		['04-shows', '/shows'],
		['05-events', '/events'],
		['06-hardware', '/hardware'],
		['07-software', '/software'],
		['08-merch', '/merch'],
		['09-projects', '/projects'],
		['10-media', '/media'],
		['11-people', '/people'],
		['12-applications', '/applications'],
		['13-transactions', '/transactions'],
		['14-budgets', '/budgets'],
		['15-learning', '/learning'],
		['16-incidents', '/incidents'],
		['17-collections', '/collections'],
		['18-admin-health', '/admin/health'],
		['19-admin-design', '/admin/design'],
		['20-admin-data', '/admin/data'],
		['21-projects-board', '/projects'],
		['22-project-detail', '/projects?open=78'],
		['23-project-tracklist', '/projects?open=78&tab=rundown'],
		...(show ? [['24-show-detail', `/shows/${show}`]] : []),
		...(note ? [['25-note-detail', `/notes/${note}`]] : []),
		...(todo ? [['26-record-detail', `/todos/${todo}`]] : [])
	];
}

const chromium = loadChromium();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
	colorScheme: dark ? 'dark' : 'light'
});
const page = await context.newPage();

// The theme is a client preference, not a media query, so set it the way the
// app stores it rather than relying on colorScheme alone.
if (dark) {
	await page.addInitScript(() => localStorage.setItem('mode-watcher-mode', 'dark'));
}

let ok = 0;
let failed = 0;
for (const [name, path] of await routes(page)) {
	const file = join(OUT, `${name}${dark ? '-dark' : ''}.png`);
	try {
		const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
		if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
		// Let late work settle: file listings, thumbnails, the editor mounting.
		await page.waitForTimeout(900);
		await page.screenshot({ path: file, fullPage });
		console.log(`  ✓ ${name.padEnd(22)} ${path}`);
		ok++;
	} catch (e) {
		console.log(`  ✗ ${name.padEnd(22)} ${path}  — ${e.message.split('\n')[0]}`);
		failed++;
	}
}

await browser.close();
console.log(`\n${ok} captured${failed ? `, ${failed} failed` : ''} → ${OUT}`);
