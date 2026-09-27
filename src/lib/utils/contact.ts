/**
 * Contact-field normalization (T117a).
 *
 * Phone and email are identity keys (resolveSubscriber steps 2 and 3) and the
 * organizer texts guests from the stored numbers, so equal contacts have to be
 * stored equal. Without this, "(415) 555-2671" and "415-555-2671" were two
 * guests, and so were "Sam@x.com" and "sam@x.com" (the unique indexes are
 * case-sensitive).
 *
 * Deliberately minimal and US-centric — no libphonenumber:
 *   - 10 digits, or 1 + 10 digits            -> +1XXXXXXXXXX
 *   - a leading "+", then 8-15 digits        -> kept as +<digits> (E.164 range)
 *   - anything else                          -> rejected, with a message that
 *     says what would work
 * That is the whole rule. It cannot tell a valid international number from a
 * merely plausible one, and it does not try to; someone who types "+44 ..."
 * gets exactly what they typed, digits only.
 */

const PHONE_HELP =
	"That phone number doesn't look right. Use a 10-digit number with area code, or start with + and the country code.";
const EMAIL_HELP = "That email address doesn't look right.";

// Loose on purpose: type="email" on the client does the strict pass. This only
// keeps values out that would break a mailto: link or an identity match.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased, trimmed. Null when the shape is unusable; empty input is the caller's concern. */
export function normalizeEmail(raw: string): string | null {
	const email = raw.trim().toLowerCase();
	return EMAIL_SHAPE.test(email) ? email : null;
}

/** E.164-style `+<digits>`, or null when it can't be read as a phone number. */
export function normalizePhone(raw: string): string | null {
	const trimmed = raw.trim();

	// Letters mean "ext", "call me", "x5" — none of which are a dialable number.
	if (/[a-z]/i.test(trimmed)) return null;

	const digits = trimmed.replace(/\D/g, '');

	if (trimmed.startsWith('+')) {
		return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
	}

	// North American numbers: area codes and exchanges never start with 0 or 1,
	// and a leading 1 is the country code.
	if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
	if (digits.length === 11 && /^1[2-9]/.test(digits)) return `+${digits}`;

	return null;
}

export interface ContactResult {
	email: string | null;
	phone: string | null;
	/** A message safe to show the guest, or null when the contact is usable. */
	error: string | null;
}

/**
 * Reads the email and phone fields of a form. Empty fields are fine — at least
 * one of the two must be present — but a field that IS filled in and can't be
 * read is an error rather than being silently dropped, so a typo in a phone
 * number never turns into "email or phone is required".
 */
export function readContact(emailRaw: unknown, phoneRaw: unknown): ContactResult {
	const emailText = typeof emailRaw === 'string' ? emailRaw.trim() : '';
	const phoneText = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';

	let email: string | null = null;
	let phone: string | null = null;

	if (emailText) {
		email = normalizeEmail(emailText);
		if (!email) return { email: null, phone: null, error: EMAIL_HELP };
	}
	if (phoneText) {
		phone = normalizePhone(phoneText);
		if (!phone) return { email: null, phone: null, error: PHONE_HELP };
	}
	if (!email && !phone) {
		return { email: null, phone: null, error: 'Email or phone number is required.' };
	}
	return { email, phone, error: null };
}
