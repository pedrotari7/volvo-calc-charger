import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn(async (..._a: unknown[]) => undefined);
const doc = vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
vi.mock('firebase/firestore', () => ({
	doc: (db: unknown, ...s: string[]) => doc(db, ...s),
	setDoc: (...a: unknown[]) => setDoc(...a),
	serverTimestamp: () => 'SERVER_TS',
}));

const getToken = vi.fn(async (..._a: unknown[]): Promise<string> => 'tok-1');
const isSupported = vi.fn(async () => true);
vi.mock('firebase/messaging', () => ({
	getMessaging: () => ({}),
	getToken: (...a: unknown[]) => getToken(...a),
	isSupported: () => isSupported(),
}));
vi.mock('./firebaseClient', () => ({ getFirebaseApp: () => ({}), getDb: () => ({}) }));

import { enablePush } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const requestPermission = vi.fn(async (): Promise<string> => 'granted');
const registration = { scope: '/' };

const env = (ua: string, standalone: boolean) => {
	vi.stubGlobal('navigator', {
		userAgent: ua,
		maxTouchPoints: 0,
		serviceWorker: { ready: Promise.resolve(registration) },
	});
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone') }));
	vi.stubGlobal('Notification', { requestPermission });
};

beforeEach(() => {
	vi.stubEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY', 'vapid-key');
	setDoc.mockClear();
	getToken.mockClear();
	requestPermission.mockReset();
	requestPermission.mockResolvedValue('granted');
	isSupported.mockResolvedValue(true);
	env('Mozilla/5.0 (Linux; Android 14) Chrome/130', false);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('enablePush', () => {
	it('returns needs-install on iOS outside standalone without prompting', async () => {
		env(IPHONE, false);
		expect(await enablePush('u1')).toBe('needs-install');
		expect(requestPermission).not.toHaveBeenCalled();
		expect(setDoc).not.toHaveBeenCalled();
	});

	it('returns denied and writes nothing when permission is refused', async () => {
		requestPermission.mockResolvedValue('denied');
		expect(await enablePush('u1')).toBe('denied');
		expect(getToken).not.toHaveBeenCalled();
		expect(setDoc).not.toHaveBeenCalled();
	});

	it('returns unsupported when the browser has no FCM support', async () => {
		isSupported.mockResolvedValue(false);
		expect(await enablePush('u1')).toBe('unsupported');
		expect(requestPermission).not.toHaveBeenCalled();
	});

	it('returns unsupported without a service worker or Notification', async () => {
		vi.stubGlobal('Notification', undefined);
		expect(await enablePush('u1')).toBe('unsupported');
	});

	it('registers the token once at users/{uid}/pushTokens/{token} when granted', async () => {
		env(IPHONE, true);
		expect(await enablePush('u1')).toBe('enabled');
		expect(getToken).toHaveBeenCalledWith(expect.anything(), {
			vapidKey: 'vapid-key',
			serviceWorkerRegistration: registration,
		});
		expect(setDoc).toHaveBeenCalledTimes(1);
		expect(setDoc).toHaveBeenCalledWith(
			{ path: 'users/u1/pushTokens/tok-1' },
			{
				token: 'tok-1',
				createdAt: 'SERVER_TS',
				userAgent: IPHONE,
			}
		);
	});

	it('returns unsupported when no token comes back', async () => {
		getToken.mockResolvedValue('');
		expect(await enablePush('u1')).toBe('unsupported');
		expect(setDoc).not.toHaveBeenCalled();
	});
});
