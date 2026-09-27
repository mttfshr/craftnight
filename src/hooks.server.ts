import { error, redirect, type Handle } from '@sveltejs/kit';
import { makeDb } from '$lib/db';
import { isOrganizerSessionValid, readSubscriberCookieMap } from '$lib/server/auth';

const LOGIN_PATH = '/organizer/login';

/** `/organizer` and everything under it — but not `/organizerfoo`. */
function isOrganizerPath(pathname: string): boolean {
	return pathname === '/organizer' || pathname.startsWith('/organizer/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;

	// No binding means the platform proxy isn't running (plain `vite build &&
	// vite preview`, say) or the Worker is misconfigured. Fail loudly rather
	// than letting routes destructure undefined halfway through a request.
	if (!env?.DB) {
		error(503, 'Database binding unavailable — is wrangler/platformProxy running?');
	}

	event.locals.db = makeDb(env.DB);
	event.locals.organizer = await isOrganizerSessionValid(event.cookies, env);
	event.locals.subscriberCookie = await readSubscriberCookieMap(event.cookies, env.SESSION_SECRET);

	// THE authorization boundary for the organizer surface (FR-060).
	//
	// This must live here and not only in organizer/+layout.server.ts. SvelteKit
	// does not run a layout `load` before a form action or a +server.ts endpoint
	// — a POST goes straight to the action — so a layout-only gate protects page
	// *views* while leaving every organizer mutation (create/edit event, create/
	// edit instance, image upload) callable by anyone. A hook runs for every
	// request regardless of what it resolves to.
	//
	// The layout gate stays as a second layer and for the login/logout redirects.
	if (isOrganizerPath(event.url.pathname) && event.url.pathname !== LOGIN_PATH && !event.locals.organizer) {
		redirect(303, LOGIN_PATH);
	}

	return resolve(event);
};
