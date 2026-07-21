import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { watch, type FSWatcher } from 'node:fs';
import { recordRoot } from '$lib/server/files';

// Server-sent events stream that fires "changed" whenever anything in the
// record's folder changes on disk. The fs watcher only lives while a client
// is connected (recursive inotify on a big tree isn't free), events are
// debounced, and a failed watch (unmounted drive) just ends the stream —
// the client falls back to manual refreshes.
export const GET: RequestHandler = async ({ params }) => {
	const root = await recordRoot(params.module, params.id);
	if (!root) throw error(404, 'no folder linked');

	const enc = new TextEncoder();
	let watcher: FSWatcher | null = null;
	let debounce: ReturnType<typeof setTimeout> | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const cleanup = () => {
				watcher?.close();
				clearTimeout(debounce);
				clearInterval(heartbeat);
			};
			const send = (msg: string) => {
				try {
					controller.enqueue(enc.encode(msg));
				} catch {
					cleanup();
				}
			};
			try {
				watcher = watch(root, { recursive: true }, () => {
					clearTimeout(debounce);
					debounce = setTimeout(() => send('data: changed\n\n'), 500);
				});
				watcher.on('error', () => {
					cleanup();
					try {
						controller.close();
					} catch {
						// already closed
					}
				});
			} catch {
				throw error(503, 'cannot watch folder — is the drive mounted?');
			}
			send('data: watching\n\n');
			// Comment frames keep idle connections from being reaped.
			heartbeat = setInterval(() => send(': ping\n\n'), 30_000);
		},
		cancel() {
			watcher?.close();
			clearTimeout(debounce);
			clearInterval(heartbeat);
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
