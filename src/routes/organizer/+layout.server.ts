import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const onLoginPage = url.pathname === '/organizer/login';

	if (!locals.organizer && !onLoginPage) {
		redirect(303, '/organizer/login');
	}

	if (locals.organizer && onLoginPage) {
		redirect(303, '/organizer');
	}

	return {};
};
