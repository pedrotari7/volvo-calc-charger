import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebase';

/** Returns the caller's email if verified and on config/allowlist, else throws permission-denied. */
export async function assertAllowed(auth: CallableRequest['auth']): Promise<string> {
	const email = auth?.token.email;
	if (!email || auth?.token.email_verified !== true) {
		throw new HttpsError('permission-denied', 'Not allowed');
	}
	const snap = await db.doc('config/allowlist').get();
	const emails: unknown = snap.get('emails');
	if (!Array.isArray(emails) || !emails.includes(email)) {
		throw new HttpsError('permission-denied', 'Not allowed');
	}
	return email;
}
