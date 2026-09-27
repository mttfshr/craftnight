/**
 * Cover image upload to R2 via the Worker's native binding (FR-030, ADR-006).
 *
 * Replaces @aws-sdk/client-s3, which pulled roughly three dozen transitive
 * packages to perform a single PutObject. No credentials, no endpoint, no
 * request signing — the binding is the capability.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif'
};

export class UploadError extends Error {}

/**
 * Returns the public URL to store in `events.cover_image_url`.
 *
 * The extension comes from the declared MIME type rather than the client's
 * filename, so a file called `x.jpg.html` can't smuggle an extension into the
 * key. The type is still client-declared, which is why the bucket serves with
 * an explicit contentType and the allow-list is narrow.
 */
export async function uploadImage(
	bucket: R2Bucket,
	publicUrl: string,
	file: File
): Promise<string> {
	const extension = ALLOWED[file.type];
	if (!extension) {
		throw new UploadError(`Unsupported image type: ${file.type || 'unknown'}`);
	}
	if (file.size === 0) {
		throw new UploadError('File is empty.');
	}
	if (file.size > MAX_BYTES) {
		throw new UploadError(`Image is too large (max ${MAX_BYTES / 1024 / 1024}MB).`);
	}

	const key = `images/${crypto.randomUUID()}.${extension}`;

	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: {
			contentType: file.type,
			cacheControl: 'public, max-age=31536000, immutable'
		}
	});

	return `${publicUrl.replace(/\/+$/, '')}/${key}`;
}
