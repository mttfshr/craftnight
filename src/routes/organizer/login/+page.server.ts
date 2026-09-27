import { fail, redirect } from '@sveltejs/kit';
import { setOrganizerSession } from '$lib/server/auth';
import { verifyPassword } from '$lib/server/password';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const password = data.get('password');

		if (typeof password !== 'string' || !password) {
			return fail(400, { error: 'Password is required.' });
		}

		const env = platform?.env;

		// A deploy that forgot `wrangler secret put` must reject logins rather
		// than accept them (FR-057). verifyPassword returns false for a missing
		// hash, and setOrganizerSession refuses without a secret — but say so
		// distinctly here, because "incorrect password" would send the organizer
		// hunting for a typo instead of a missing secret.
		if (!env?.ORGANIZER_PASSWORD_HASH || !env?.SESSION_SECRET) {
			return fail(500, { error: 'Server is missing its auth configuration.' });
		}

		if (!(await verifyPassword(password, env.ORGANIZER_PASSWORD_HASH))) {
			return fail(401, { error: 'Incorrect password.' });
		}

		if (!(await setOrganizerSession(cookies, env))) {
			return fail(500, { error: 'Could not start a session.' });
		}

		redirect(303, '/organizer');
	}
};
