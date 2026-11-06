import { createHash, randomBytes } from 'node:crypto';
import { db } from '../lib/firebase';

/** Exactly the scopes in spec section 3. `conve:unlock` is deliberately absent. */
export const VOLVO_SCOPES = [
	'openid',
	'conve:vehicle_relation',
	'conve:lock_status',
	'conve:doors_status',
	'conve:windows_status',
	'conve:odometer_status',
	'conve:tyre_status',
	'conve:warnings',
	'conve:diagnostics_workshop',
	'conve:trip_statistics',
	'conve:battery_charge_level',
	'conve:recharge_status',
	'conve:command_accessibility',
	'conve:commands',
	'conve:lock',
	'conve:climatization_start_stop',
	'energy:state:read',
	'energy:capability:read',
	'energy:battery_charge_level',
	'energy:electric_range',
	'energy:charging_connection_status',
	'energy:charging_system_status',
	'energy:estimated_charging_time',
	'energy:recharge_status',
	'energy:charging_history:read',
	'location:read',
].join(' ');

export const AUTH_URL = 'https://auth.volvocars.com/realms/volvocars/protocol/openid-connect/auth';
export const TOKEN_URL = 'https://auth.volvocars.com/realms/volvocars/protocol/openid-connect/token';
export const REDIRECT_URI = 'https://volvo-calc-charger.vercel.app/api/volvo/callback';

export type TokenSet = { accessToken: string; refreshToken: string; expiresIn: number };
export type VolvoCreds = { clientId: string; clientSecret: string };
export type FetchFn = typeof fetch;

/** The refresh token is dead (revoked, expired grant or already spent); the owner must sign in again. */
export class VolvoReconnectRequired extends Error {
	constructor(message = 'Volvo reconnect required') {
		super(message);
		this.name = 'VolvoReconnectRequired';
	}
}

const REFRESH_MARGIN_MS = 60_000;
const LEASE_MS = 30_000;
const LEASE_POLL_MS = 100;
const REQUEST_TIMEOUT_MS = 15_000;

const base64Url = (buf: Buffer) => buf.toString('base64url');

export function buildAuthorizeUrl(clientId: string, state: string, codeChallenge: string): string {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		scope: VOLVO_SCOPES,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
	});
	return `${AUTH_URL}?${params.toString()}`;
}

const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function createPkcePair(): { verifier: string; challenge: string } {
	// The alphabet has 66 characters; discard bytes >= 198 (3 * 66) so the modulo stays unbiased.
	let verifier = '';
	while (verifier.length < 64) {
		for (const byte of randomBytes(96)) {
			if (byte < 198 && verifier.length < 64) verifier += VERIFIER_ALPHABET[byte % 66];
		}
	}
	const challenge = base64Url(createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

const basicAuth = (creds: VolvoCreds) =>
	`Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`;

async function postToken(body: URLSearchParams, creds: VolvoCreds, fetchFn: FetchFn): Promise<Response> {
	return fetchFn(TOKEN_URL, {
		method: 'POST',
		headers: {
			Authorization: basicAuth(creds),
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json',
		},
		body: body.toString(),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
}

async function parseTokenSet(res: Response): Promise<TokenSet> {
	const json = (await res.json()) as Record<string, unknown>;
	const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = json;
	if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof expiresIn !== 'number') {
		throw new Error('Volvo token response had an unexpected shape');
	}
	return { accessToken, refreshToken, expiresIn };
}

export async function exchangeCode(
	code: string,
	verifier: string,
	creds: VolvoCreds,
	fetchFn: FetchFn = fetch
): Promise<TokenSet> {
	const res = await postToken(
		new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT_URI,
			code_verifier: verifier,
		}),
		creds,
		fetchFn
	);
	if (!res.ok) throw new Error(`Volvo code exchange failed (${res.status})`);
	return parseTokenSet(res);
}

type Claim = { kind: 'token'; token: string } | { kind: 'claimed'; refreshToken: string } | { kind: 'wait' };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns a valid access token, refreshing it if needed.
 *
 * Volvo rotates the refresh token on every refresh, so two overlapping refreshes with the same
 * token would burn the grant. The Volvo call therefore must not happen inside a Firestore
 * transaction body (which the SDK may retry or run concurrently with a rival that read the same
 * state). Instead a transaction re-reads the doc and either returns the token another invocation
 * already refreshed, or claims a short lease (`refreshingUntil`). Only the lease holder calls Volvo;
 * everyone else polls until the new token appears or the lease lapses.
 */
export async function getAccessToken(
	creds: VolvoCreds,
	fetchFn: FetchFn = fetch,
	now: () => Date = () => new Date()
): Promise<string> {
	const ref = db.doc('private/volvo');

	for (;;) {
		const claim = await db.runTransaction(async (tx): Promise<Claim> => {
			const snap = await tx.get(ref);
			const data = snap.data();
			if (!data || typeof data.refreshToken !== 'string') {
				throw new VolvoReconnectRequired('Volvo is not connected');
			}
			const at = now().getTime();
			const expiresAt = Date.parse(data.accessExpiresAt ?? '');
			if (typeof data.accessToken === 'string' && expiresAt - REFRESH_MARGIN_MS > at) {
				return { kind: 'token', token: data.accessToken };
			}
			const leaseUntil = Date.parse(data.refreshingUntil ?? '');
			if (leaseUntil > at) return { kind: 'wait' };
			tx.update(ref, { refreshingUntil: new Date(at + LEASE_MS).toISOString() });
			return { kind: 'claimed', refreshToken: data.refreshToken };
		});

		if (claim.kind === 'token') return claim.token;
		if (claim.kind === 'wait') {
			await sleep(LEASE_POLL_MS);
			continue;
		}
		return refreshWithLease(claim.refreshToken, creds, fetchFn, now);
	}
}

async function refreshWithLease(
	refreshToken: string,
	creds: VolvoCreds,
	fetchFn: FetchFn,
	now: () => Date
): Promise<string> {
	const ref = db.doc('private/volvo');
	let res: Response;
	try {
		res = await postToken(
			new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
			creds,
			fetchFn
		);
	} catch (err) {
		await ref.update({ refreshingUntil: null });
		throw err;
	}

	if (res.status === 400 || res.status === 401) {
		const lastRefreshError = `refresh rejected (${res.status}) at ${now().toISOString()}`;
		const batch = db.batch();
		batch.update(ref, { refreshingUntil: null, lastRefreshError });
		batch.set(db.doc('status/volvo'), { connected: false, lastRefreshError }, { merge: true });
		await batch.commit();
		throw new VolvoReconnectRequired(lastRefreshError);
	}
	if (!res.ok) {
		await ref.update({ refreshingUntil: null });
		throw new Error(`Volvo token refresh failed (${res.status})`);
	}

	let tokens: TokenSet;
	try {
		tokens = await parseTokenSet(res);
	} catch (err) {
		await ref.update({ refreshingUntil: null });
		throw err;
	}
	// One atomic write: the rotated refresh token lands together with the access token.
	await ref.update({
		refreshToken: tokens.refreshToken,
		accessToken: tokens.accessToken,
		accessExpiresAt: new Date(now().getTime() + tokens.expiresIn * 1000).toISOString(),
		refreshingUntil: null,
		lastRefreshError: null,
	});
	return tokens.accessToken;
}
