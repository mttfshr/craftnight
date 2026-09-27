import { events } from '$lib/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const allEvents = await locals.db.select().from(events).orderBy(desc(events.created_at));
	return { events: allEvents };
};
