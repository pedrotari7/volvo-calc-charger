import type { CallableRequest } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as commands from '../src/commands';
import { runCommand } from '../src/commands';
import { db } from '../src/lib/firebase';
import { createVolvoClient } from '../src/providers/volvo';
import { VolvoReconnectRequired } from '../src/providers/volvoAuth';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const auth = (email: string) =>
	({ uid: 'u1', token: { email, email_verified: true } }) as unknown as CallableRequest['auth'];

const VIN = 'YV1TESTVIN0001234';
const vehiclesBody = { data: [{ vin: VIN }] };

function setup(
	commandRes: Response | (() => Response),
	vehicles: unknown = vehiclesBody,
	getToken = async () => 'tok'
) {
	const fetchFn = vi.fn(async (url: string | URL | Request) => {
		const u = String(url);
		if (u.endsWith('/connected-vehicle/v2/vehicles')) return json(200, vehicles);
		return typeof commandRes === 'function' ? commandRes() : commandRes;
	});
	const client = createVolvoClient('key', getToken, fetchFn as unknown as typeof fetch);
	return { fetchFn, deps: { client } };
}
const posts = (fetchFn: ReturnType<typeof setup>['fetchFn']) =>
	fetchFn.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

beforeEach(async () => {
	await db.doc('config/allowlist').set({ emails: ['me@x.se'] });
});

describe('commands module', () => {
	it('exports the callables and the injectable core', () => {
		expect(Object.keys(commands).sort()).toEqual([
			'carCommand',
			'lockCar',
			'runCommand',
			'startClimate',
			'stopClimate',
		]);
	});
});

describe('runCommand', () => {
	it('rejects a non-allowlisted caller without any Volvo fetch', async () => {
		const { fetchFn, deps } = setup(json(200, {}));
		await expect(runCommand(auth('evil@x.se'), 'lock', deps)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('sends exactly one POST to the lock endpoint for the first vehicle', async () => {
		const { fetchFn, deps } = setup(json(200, { data: { invokeStatus: 'COMPLETED' } }));
		const res = await runCommand(auth('me@x.se'), 'lock', deps);
		expect(res).toEqual({ ok: true, status: 'COMPLETED' });
		const p = posts(fetchFn);
		expect(p).toHaveLength(1);
		expect(String(p[0][0])).toBe(`https://api.volvocars.com/connected-vehicle/v2/vehicles/${VIN}/commands/lock`);
	});

	it.each([
		'climatization-start',
		'climatization-stop',
		'lock-reduced-guard',
		'honk',
		'flash',
		'honk-flash',
	] as const)('posts %s', async name => {
		const { fetchFn, deps } = setup(json(200, { data: { invokeStatus: 'DELIVERED' } }));
		expect((await runCommand(auth('me@x.se'), name, deps)).ok).toBe(true);
		expect(String(posts(fetchFn)[0][0])).toMatch(new RegExp(`/commands/${name}$`));
	});

	it('refuses unlock and other unknown commands before any Volvo call', async () => {
		const { fetchFn, deps } = setup(json(200, {}));
		await expect(runCommand(auth('me@x.se'), 'unlock' as never, deps)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('remembers the last command and whether climate is running in car/remote', async () => {
		const at = '2026-11-27T07:00:00.000Z' as const;
		const { deps } = setup(() => json(200, { data: { invokeStatus: 'COMPLETED' } }));
		await db.doc('car/remote').delete();
		await runCommand(auth('me@x.se'), 'climatization-start', { ...deps, now: () => at });
		expect((await db.doc('car/remote').get()).data()).toEqual({
			last: { command: 'climatization-start', ok: true, status: 'COMPLETED', at },
			climateStartedAt: at,
		});
		await runCommand(auth('me@x.se'), 'honk', { ...deps, now: () => at });
		expect((await db.doc('car/remote').get()).data()?.climateStartedAt).toBe(at);
		await runCommand(auth('me@x.se'), 'climatization-stop', { ...deps, now: () => at });
		expect((await db.doc('car/remote').get()).data()?.climateStartedAt).toBeNull();
	});

	it('does not mark climate as running when the start fails', async () => {
		const { deps } = setup(json(422, { data: { invokeStatus: 'REJECTED' } }));
		await db.doc('car/remote').delete();
		await runCommand(auth('me@x.se'), 'climatization-start', deps);
		const remote = (await db.doc('car/remote').get()).data();
		expect(remote?.last).toMatchObject({ command: 'climatization-start', ok: false, status: 'REJECTED' });
		expect(remote?.climateStartedAt).toBeUndefined();
	});

	it('returns ok:false with the message on a Volvo 4xx and never retries', async () => {
		const { fetchFn, deps } = setup(json(422, { data: { invokeStatus: 'REJECTED', message: 'Car is busy' } }));
		const res = await runCommand(auth('me@x.se'), 'lock', deps);
		expect(res).toEqual({ ok: false, status: 'REJECTED', message: 'Car is busy' });
		expect(posts(fetchFn)).toHaveLength(1);
	});

	it('maps VolvoReconnectRequired to failed-precondition volvo-reconnect', async () => {
		const { fetchFn, deps } = setup(json(200, {}), vehiclesBody, async () => {
			throw new VolvoReconnectRequired();
		});
		await expect(runCommand(auth('me@x.se'), 'lock', deps)).rejects.toMatchObject({
			code: 'failed-precondition',
			message: 'volvo-reconnect',
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('throws not-found no-vehicle when Volvo lists no vehicle, with no POST', async () => {
		const { fetchFn, deps } = setup(json(200, {}), { data: [] });
		await expect(runCommand(auth('me@x.se'), 'lock', deps)).rejects.toMatchObject({
			code: 'not-found',
			message: 'no-vehicle',
		});
		expect(posts(fetchFn)).toHaveLength(0);
	});
});
