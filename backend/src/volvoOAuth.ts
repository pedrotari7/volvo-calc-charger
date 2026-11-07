import { randomBytes } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { assertAllowed } from './lib/allowlist';
import { db } from './lib/firebase';
import { VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET } from './lib/secrets';
import type { FetchFn, VolvoCreds } from './providers/volvoAuth';
import { buildAuthorizeUrl, createPkcePair, exchangeCode, VolvoExchangeError } from './providers/volvoAuth';

const SETTINGS_URL = 'https://volvo-calc-charger.vercel.app/settings';
const FLOW_TTL_MS = 10 * 60_000;

const redirectError = (reason: string) => `${SETTINGS_URL}?volvo=error&reason=${reason}`;

export async function startVolvoAuth(auth: CallableRequest['auth'], clientId: string): Promise<{ url: string }> {
	await assertAllowed(auth);
	const { verifier, challenge } = createPkcePair();
	const state = randomBytes(24).toString('base64url');
	await db.doc('private/volvoAuth').set({
		verifier,
		state,
		expiresAt: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
	});
	return { url: buildAuthorizeUrl(clientId, state, challenge) };
}

/** Validates the redirect from Volvo and returns the URL to send the browser to. Never throws. */
export async function handleVolvoCallback(
	query: Record<string, unknown>,
	creds: VolvoCreds,
	fetchFn: FetchFn = fetch
): Promise<string> {
	const state = typeof query.state === 'string' ? query.state : '';
	const code = typeof query.code === 'string' ? query.code : '';

	const pendingRef = db.doc('private/volvoAuth');
	const pending = (await pendingRef.get()).data();
	if (!state || !pending || pending.state !== state) return redirectError('state');

	// The pending flow is single-use, whatever happens next.
	await pendingRef.delete();
	if (Date.parse(pending.expiresAt) < Date.now()) return redirectError('expired');
	if (typeof query.error === 'string') return redirectError('denied');
	if (!code) return redirectError('code');

	try {
		const tokens = await exchangeCode(code, pending.verifier, creds, fetchFn);
		const now = new Date();
		const grantStartedAt = now.toISOString();
		const batch = db.batch();
		batch.set(db.doc('private/volvo'), {
			refreshToken: tokens.refreshToken,
			accessToken: tokens.accessToken,
			accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000).toISOString(),
			grantStartedAt,
			lastRefreshError: null,
		});
		batch.set(db.doc('status/volvo'), { connected: true, grantStartedAt, lastRefreshError: null });
		await batch.commit();
		return `${SETTINGS_URL}?volvo=connected`;
	} catch (err) {
		// Status and error class only: never the response body, the code or any token.
		logger.warn('volvoCallback: code exchange failed', {
			status: err instanceof VolvoExchangeError ? err.status : null,
			errorClass: err instanceof Error ? err.name : typeof err,
		});
		return redirectError('exchange');
	}
}

export async function disconnectVolvo(auth: CallableRequest['auth']): Promise<void> {
	await assertAllowed(auth);
	const batch = db.batch();
	batch.delete(db.doc('private/volvo'));
	batch.set(db.doc('status/volvo'), { connected: false, grantStartedAt: null, lastRefreshError: null });
	await batch.commit();
}

export const volvoAuthStart = onCall({ secrets: [VOLVO_CLIENT_ID] }, req =>
	startVolvoAuth(req.auth, VOLVO_CLIENT_ID.value())
);

export const volvoCallback = onRequest({ secrets: [VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET] }, async (req, res) => {
	const target = await handleVolvoCallback(req.query, {
		clientId: VOLVO_CLIENT_ID.value(),
		clientSecret: VOLVO_CLIENT_SECRET.value(),
	});
	res.set('Cache-Control', 'no-store');
	res.redirect(302, target);
});

export const volvoDisconnect = onCall(async req => {
	await disconnectVolvo(req.auth);
	return { ok: true };
});
