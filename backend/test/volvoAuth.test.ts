import { createHash } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/firebase';
import {
	AUTH_URL,
	buildAuthorizeUrl,
	createPkcePair,
	exchangeCode,
	getAccessToken,
	REDIRECT_URI,
	TOKEN_URL,
	VOLVO_SCOPES,
	VolvoReconnectRequired,
} from '../src/providers/volvoAuth';
import { disconnectVolvo, handleVolvoCallback, startVolvoAuth } from '../src/volvoOAuth';

const creds = { clientId: 'cid', clientSecret: 'csecret' };
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const auth = (email: string) =>
	({ uid: 'u1', token: { email, email_verified: true } }) as unknown as CallableRequest['auth'];

const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(async () => {
	await Promise.all(['private/volvo', 'private/volvoAuth', 'status/volvo'].map(p => db.doc(p).delete()));
	await db.doc('config/allowlist').set({ emails: ['me@x.se'] });
});

describe('buildAuthorizeUrl', () => {
	const url = buildAuthorizeUrl('cid', 'st4te', 'chal');

	it('is a PKCE S256 authorization-code request', () => {
		expect(url.startsWith(`${AUTH_URL}?`)).toBe(true);
		expect(url).toContain('response_type=code');
		expect(url).toContain('code_challenge_method=S256');
		expect(url).toContain('code_challenge=chal');
		expect(url).toContain('state=st4te');
		expect(url).toContain('client_id=cid');
		expect(url).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
	});

	it('requests the 26 spec scopes and never unlock', () => {
		expect(VOLVO_SCOPES.split(' ')).toHaveLength(26);
		expect(url).not.toContain('conve:unlock');
		expect(new URL(url).searchParams.get('scope')).toBe(VOLVO_SCOPES);
	});
});

describe('createPkcePair', () => {
	it('makes a 64-char unreserved verifier and an S256 challenge', () => {
		const { verifier, challenge } = createPkcePair();
		expect(verifier).toHaveLength(64);
		expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
		expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
		expect(challenge).not.toContain('=');
		expect(createPkcePair().verifier).not.toBe(verifier);
	});
});

describe('exchangeCode', () => {
	it('sends basic auth and the authorization_code grant with the verifier', async () => {
		const fetchFn = vi.fn(async () => json(200, { access_token: 'a', refresh_token: 'r', expires_in: 1800 }));
		const tokens = await exchangeCode('thecode', 'theverifier', creds, fetchFn as unknown as typeof fetch);
		expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 1800 });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(TOKEN_URL);
		expect((init.headers as Record<string, string>).Authorization).toBe(
			`Basic ${Buffer.from('cid:csecret').toString('base64')}`
		);
		const body = new URLSearchParams(init.body as string);
		expect(body.get('grant_type')).toBe('authorization_code');
		expect(body.get('code')).toBe('thecode');
		expect(body.get('code_verifier')).toBe('theverifier');
		expect(body.get('redirect_uri')).toBe(REDIRECT_URI);
	});

	it('throws on a non-2xx without leaking the body', async () => {
		const fetchFn = vi.fn(async () => json(400, { error: 'invalid_grant', secret: 'leak' }));
		await expect(exchangeCode('c', 'v', creds, fetchFn as unknown as typeof fetch)).rejects.toThrow(
			/code exchange failed \(400\)$/
		);
	});
});

describe('getAccessToken', () => {
	const seed = (accessExpiresAt: string) =>
		db.doc('private/volvo').set({
			refreshToken: 'r0',
			accessToken: 'a0',
			accessExpiresAt,
			grantStartedAt: iso(Date.now()),
			lastRefreshError: null,
		});

	it('returns a fresh stored token without calling Volvo', async () => {
		await seed(iso(Date.now() + 10 * 60_000));
		const fetchFn = vi.fn();
		await expect(getAccessToken(creds, fetchFn as unknown as typeof fetch)).resolves.toBe('a0');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('refreshes a token inside the 60 s margin', async () => {
		await seed(iso(Date.now() + 30_000));
		const fetchFn = vi.fn(async () => json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 }));
		await expect(getAccessToken(creds, fetchFn as unknown as typeof fetch)).resolves.toBe('a1');
		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		const body = new URLSearchParams(init.body as string);
		expect(body.get('grant_type')).toBe('refresh_token');
		expect(body.get('refresh_token')).toBe('r0');
	});

	it('two concurrent calls on an expired token spend the refresh token exactly once', async () => {
		await seed(iso(Date.now() - 1000));
		const fetchFn = vi.fn(async () => {
			await new Promise(r => setTimeout(r, 300)); // slow enough that the rival is mid-flight
			return json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 });
		});
		const [x, y] = await Promise.all([
			getAccessToken(creds, fetchFn as unknown as typeof fetch),
			getAccessToken(creds, fetchFn as unknown as typeof fetch),
		]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect([x, y]).toEqual(['a1', 'a1']);
		const stored = (await db.doc('private/volvo').get()).data();
		expect(stored?.refreshToken).toBe('r1');
		expect(stored?.accessToken).toBe('a1');
		expect(stored?.refreshingUntil).toBeNull();
		expect(Date.parse(stored?.accessExpiresAt)).toBeGreaterThan(Date.now() + 25 * 60_000);
	});

	it('takes over an expired lease left by a crashed invocation', async () => {
		await db.doc('private/volvo').set({
			refreshToken: 'r0',
			accessToken: 'a0',
			accessExpiresAt: iso(Date.now() - 1000),
			refreshingUntil: iso(Date.now() - 1000),
		});
		const fetchFn = vi.fn(async () => json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 }));
		await expect(getAccessToken(creds, fetchFn as unknown as typeof fetch)).resolves.toBe('a1');
	});

	it('on 400 invalid_grant records the error, flags status and throws VolvoReconnectRequired', async () => {
		await seed(iso(Date.now() - 1000));
		await db.doc('status/volvo').set({ connected: true, grantStartedAt: iso(0), lastRefreshError: null });
		const fetchFn = vi.fn(async () => json(400, { error: 'invalid_grant' }));
		await expect(getAccessToken(creds, fetchFn as unknown as typeof fetch)).rejects.toBeInstanceOf(
			VolvoReconnectRequired
		);
		const priv = (await db.doc('private/volvo').get()).data();
		expect(priv?.lastRefreshError).toMatch(/400/);
		expect(priv?.refreshToken).toBe('r0');
		expect(priv?.refreshingUntil).toBeNull();
		const status = (await db.doc('status/volvo').get()).data();
		expect(status?.connected).toBe(false);
		expect(status?.lastRefreshError).toMatch(/400/);
	});

	it('releases the lease and rethrows on a 5xx so the next call can retry', async () => {
		await seed(iso(Date.now() - 1000));
		const fetchFn = vi.fn(async () => json(503, {}));
		await expect(getAccessToken(creds, fetchFn as unknown as typeof fetch)).rejects.toThrow(/\(503\)/);
		expect((await db.doc('private/volvo').get()).data()?.refreshingUntil).toBeNull();
	});

	it('throws VolvoReconnectRequired when Volvo was never connected', async () => {
		await expect(getAccessToken(creds, vi.fn() as unknown as typeof fetch)).rejects.toBeInstanceOf(
			VolvoReconnectRequired
		);
	});
});

describe('handleVolvoCallback', () => {
	const home = 'https://volvo-calc-charger.vercel.app/settings';
	const pending = (over: Record<string, unknown> = {}) =>
		db
			.doc('private/volvoAuth')
			.set({ verifier: 'ver', state: 'good', expiresAt: iso(Date.now() + 5 * 60_000), ...over });

	it('redirects with reason=state on a wrong state and writes nothing', async () => {
		await pending();
		const fetchFn = vi.fn();
		const url = await handleVolvoCallback({ code: 'c', state: 'bad' }, creds, fetchFn as unknown as typeof fetch);
		expect(url).toBe(`${home}?volvo=error&reason=state`);
		expect(fetchFn).not.toHaveBeenCalled();
		expect((await db.doc('private/volvo').get()).exists).toBe(false);
		expect((await db.doc('status/volvo').get()).exists).toBe(false);
	});

	it('redirects with reason=state when no flow is pending', async () => {
		const url = await handleVolvoCallback({ code: 'c', state: 'good' }, creds, vi.fn() as unknown as typeof fetch);
		expect(url).toBe(`${home}?volvo=error&reason=state`);
	});

	it('redirects with reason=expired after the 10 minute window', async () => {
		await pending({ expiresAt: iso(Date.now() - 1000) });
		const url = await handleVolvoCallback({ code: 'c', state: 'good' }, creds, vi.fn() as unknown as typeof fetch);
		expect(url).toBe(`${home}?volvo=error&reason=expired`);
		expect((await db.doc('private/volvo').get()).exists).toBe(false);
	});

	it('redirects with reason=denied when Volvo sends an error', async () => {
		await pending();
		const url = await handleVolvoCallback(
			{ error: 'access_denied', state: 'good' },
			creds,
			vi.fn() as unknown as typeof fetch
		);
		expect(url).toBe(`${home}?volvo=error&reason=denied`);
	});

	it('on success stores tokens, a client-readable status, and consumes the pending flow', async () => {
		await pending();
		const fetchFn = vi.fn(async () => json(200, { access_token: 'a', refresh_token: 'r', expires_in: 1800 }));
		const url = await handleVolvoCallback({ code: 'c', state: 'good' }, creds, fetchFn as unknown as typeof fetch);
		expect(url).toBe(`${home}?volvo=connected`);
		const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(new URLSearchParams(init.body as string).get('code_verifier')).toBe('ver');
		const priv = (await db.doc('private/volvo').get()).data();
		expect(priv).toMatchObject({ refreshToken: 'r', accessToken: 'a', lastRefreshError: null });
		const status = (await db.doc('status/volvo').get()).data();
		expect(status).toEqual({ connected: true, grantStartedAt: priv?.grantStartedAt, lastRefreshError: null });
		expect(JSON.stringify(status)).not.toMatch(/"(a|r)"/);
		expect((await db.doc('private/volvoAuth').get()).exists).toBe(false);
	});

	it('redirects with reason=exchange when Volvo rejects the code', async () => {
		await pending();
		const fetchFn = vi.fn(async () => json(400, { error: 'invalid_grant' }));
		const url = await handleVolvoCallback({ code: 'c', state: 'good' }, creds, fetchFn as unknown as typeof fetch);
		expect(url).toBe(`${home}?volvo=error&reason=exchange`);
		expect((await db.doc('private/volvo').get()).exists).toBe(false);
	});
});

describe('startVolvoAuth', () => {
	it('rejects callers off the allowlist', async () => {
		await expect(startVolvoAuth(auth('stranger@x.se'), 'cid')).rejects.toMatchObject({ code: 'permission-denied' });
		expect((await db.doc('private/volvoAuth').get()).exists).toBe(false);
	});

	it('stores verifier, state and a 10 minute expiry, and returns the authorize URL', async () => {
		const before = Date.now();
		const { url } = await startVolvoAuth(auth('me@x.se'), 'cid');
		const stored = (await db.doc('private/volvoAuth').get()).data();
		expect(stored?.verifier).toHaveLength(64);
		const u = new URL(url);
		expect(u.searchParams.get('state')).toBe(stored?.state);
		expect(u.searchParams.get('code_challenge')).toBe(
			createHash('sha256').update(stored?.verifier).digest('base64url')
		);
		const ttl = Date.parse(stored?.expiresAt) - before;
		expect(ttl).toBeGreaterThan(9.9 * 60_000);
		expect(ttl).toBeLessThan(10.1 * 60_000);
	});
});

describe('disconnectVolvo', () => {
	it('rejects callers off the allowlist and leaves the tokens', async () => {
		await db.doc('private/volvo').set({ refreshToken: 'r' });
		await expect(disconnectVolvo(auth('stranger@x.se'))).rejects.toMatchObject({ code: 'permission-denied' });
		expect((await db.doc('private/volvo').get()).exists).toBe(true);
	});

	it('deletes the tokens and marks the status disconnected', async () => {
		await db.doc('private/volvo').set({ refreshToken: 'r' });
		await db.doc('status/volvo').set({ connected: true, grantStartedAt: iso(0), lastRefreshError: 'x' });
		await disconnectVolvo(auth('me@x.se'));
		expect((await db.doc('private/volvo').get()).exists).toBe(false);
		expect((await db.doc('status/volvo').get()).data()).toEqual({
			connected: false,
			grantStartedAt: null,
			lastRefreshError: null,
		});
	});
});
