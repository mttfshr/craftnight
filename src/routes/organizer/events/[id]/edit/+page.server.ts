import { fail, redirect, error } from '@sveltejs/kit';
import { events } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadImage, UploadError } from '$lib/server/r2';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [event] = await locals.db.select().from(events).where(eq(events.id, params.id));
	if (!event) error(404, 'Event not found');
	return { event };
};

export const actions: Actions = {
	default: async ({ request, params, locals, platform }) => {
		const form = await request.formData();

		const name = form.get('name');
		const description = form.get('description');
		const accent_color = form.get('accent_color');
		const cover_image = form.get('cover_image');

		if (typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Event name is required.' });
		}

		// Stored as markdown source and escaped at render time, so nothing to sanitize (ADR-007).
		const storedDescription = typeof description === 'string' && description.trim() ? description.trim() : null;

		const updates: Record<string, unknown> = {
			name: name.trim(),
			description: storedDescription,
			accent_color: typeof accent_color === 'string' ? accent_color : null
		};

		const cover_image_file =
			cover_image instanceof File && cover_image.size > 0 ? cover_image : null;
		if (cover_image_file) {
			const bucket = platform?.env.BUCKET;
			const publicUrl = platform?.env.R2_PUBLIC_URL;
			if (!bucket || !publicUrl) {
				return fail(500, { error: 'Image storage is not configured.' });
			}
			try {
				updates.cover_image_url = await uploadImage(bucket, publicUrl, cover_image_file);
			} catch (e) {
				if (e instanceof UploadError) return fail(400, { error: e.message });
				console.error('Image upload failed:', e);
				return fail(500, { error: 'Image upload failed. Please try again.' });
			}
		}

		await locals.db.update(events).set(updates).where(eq(events.id, params.id));

		redirect(303, `/organizer/events/${params.id}`);
	}
};
