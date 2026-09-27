import { redirect } from '@sveltejs/kit';
import { clearOrganizerSession } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearOrganizerSession(cookies);
		redirect(303, '/');
	}
};
