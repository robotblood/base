import type { HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Every unhandled error thrown while rendering a page or running an endpoint
// lands here. Until this file existed, a dashboard 500 left nothing behind but
// a stack trace in journald — real, but only findable if you already suspected
// something was wrong. The missing-chunk errors that broke /people after a
// rebuild went unnoticed for exactly this reason.
const API = env.API_BASE_URL ?? 'http://127.0.0.1:8000';

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	// 404s are navigation, not faults. Logging them would bury the real errors
	// under every mistyped URL and favicon probe.
	if (status === 404) return { message };

	const err = error instanceof Error ? error : undefined;
	const detail = {
		path: event.url.pathname,
		method: event.request.method,
		status,
		route: event.route.id,
		stack: err?.stack?.slice(0, 4000)
	};

	// Fire-and-forget. The API being unreachable is itself a plausible cause of
	// the error we're reporting, so a failure here must stay silent rather than
	// throw inside the error handler and mask the original fault.
	void fetch(`${API}/log`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			event: 'http.error',
			level: 'error',
			source: 'web',
			message: `${err?.name ?? 'Error'}: ${err?.message ?? message}`,
			detail
		}),
		signal: AbortSignal.timeout(3000)
	}).catch(() => {});

	// Keep the built-in message for the user; the specifics are in the log.
	return { message };
};
