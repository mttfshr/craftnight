import { fail, redirect } from '@sveltejs/kit';
import { events } from '$lib/db/schema';
import { slugify } from '$lib/utils/slugify';
import { uploadImage, UploadError } from '$lib/server/r2';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals, platform }) => {
		const form = await request.formData();

		const name = form.get('name');
		const description = form.get('description');
		const accent_color = form.get('accent_color');
		const cover_image = form.get('cover_image');

		if (typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Event name is required.' });
		}

		const slug = slugify(name);

		let cover_image_url: string | null = null;
		if (cover_image instanceof File && cover_image.size > 0) {
			const bucket = platform?.env.BUCKET;
			const publicUrl = platform?.env.R2_PUBLIC_URL;
			if (!bucket || !publicUrl) {
				return fail(500, { error: 'Image storage is not configured.' });
			}
			try {
				cover_image_url = await uploadImage(bucket, publicUrl, cover_image);
			} catch (e) {
				if (e instanceof UploadError) return fail(400, { error: e.message });
				console.error('Image upload failed:', e);
				return fail(500, { error: 'Image upload failed. Please try again.' });
			}
		}

		// Stored as markdown source and escaped at render time, so nothing to sanitize (ADR-007).
		const storedDescription = typeof description === 'string' && description.trim() ? description.trim() : null;

		const [event] = await locals.db
			.insert(events)
			.values({
				name: name.trim(),
				slug,
				description: storedDescription,
				accent_color: typeof accent_color === 'string' ? accent_color : null,
				cover_image_url
			})
			.returning({ id: events.id });

		redirect(303, `/organizer/events/${event.id}`);
	}
};
