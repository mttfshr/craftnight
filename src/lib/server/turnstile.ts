/**
 * Cloudflare Turnstile server-side validation (FR-031).
 *
 * Fails CLOSED (FR-057). The previous version returned `true` when no secret
 * was configured, "for dev/test" — which meant a production deploy that forgot
 * the secret silently accepted every submission with bot protection disabled
 * and no signal that anything was wrong.
 *
 * For local work, set CLOUDFLARE_TURNSTILE_SECRET to Cloudflare's
 * always-passes test secret (see .dev.vars.example). That keeps the code path
 * identical in dev and production instead of branching around it.
 */
export async function validateTurnstileToken(
	token: string,
	secret: string | undefined,
	remoteIp?: string | null
): Promise<boolean> {
	if (!secret) return false;
	if (!token) return false;

	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		// Network failure against the verification endpoint is not a pass.
		return false;
	}
}
