import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertAllowed } from '../src/lib/allowlist';
import { db } from '../src/lib/firebase';

const auth = (email: string, verified = true) =>
	({ uid: 'u1', token: { email, email_verified: verified } }) as unknown as CallableRequest['auth'];

beforeEach(async () => {
	await db.doc('config/allowlist').set({ emails: ['me@x.se'] });
});

describe('assertAllowed', () => {
	it('returns the email for an allowed verified user', async () => {
		await expect(assertAllowed(auth('me@x.se'))).resolves.toBe('me@x.se');
	});

	it.each([
		['missing auth', undefined],
		['unverified email', auth('me@x.se', false)],
		['email not on the list', auth('stranger@x.se')],
	])('rejects %s', async (_name, a) => {
		await expect(assertAllowed(a)).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects when the allowlist doc is missing', async () => {
		await db.doc('config/allowlist').delete();
		await expect(assertAllowed(auth('me@x.se'))).rejects.toMatchObject({ code: 'permission-denied' });
	});
});
