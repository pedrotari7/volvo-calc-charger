import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/firebase';
import { runPollCar } from '../src/pollCar';
import { createVolvoClient } from '../src/providers/volvo';
import type { VolvoClient } from '../src/providers/volvo';
import { VolvoReconnectRequired } from '../src/providers/volvoAuth';

const fx = (n: string) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures/volvo', `${n}.json`), 'utf8'));
const FULL_VIN = 'YV1TESTVIN0000001';
// 22:00Z on 6 Nov is 23:00 local (CET): night, so unlocked triggers the left-open alert.
const NIGHT = '2026-11-06T22:00:00.000Z';
const NOON = '2026-11-06T11:00:00.000Z';

const push = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../src/lib/push', () => ({ sendPush: push }));

type Overrides = Partial<Record<keyof VolvoClient, unknown>>;
function stubClient(over: Overrides = {}): VolvoClient {
	const sections: Record<string, unknown> = {
		doors: fx('doors'),
		windows: fx('windows'),
		odometer: fx('odometer'),
		tyres: fx('tyres'),
		warnings: fx('warnings'),
		diagnostics: fx('diagnostics'),
		statistics: fx('statistics'),
	};
	return {
		vehicles: vi.fn(async () => fx('vehicles')),
		section: vi.fn(async (_vin: string, name: string) => sections[name]),
		energy: vi.fn(async () => fx('energy-state')),
		location: vi.fn(async () => fx('location')),
		command: vi.fn(),
		...over,
	} as unknown as VolvoClient;
}

async function seedVolvo(extra: Record<string, unknown> = {}) {
	await db.doc('private/volvo').set({
		refreshToken: 'r',
		accessToken: 'a',
		accessExpiresAt: '2026-11-07T00:00:00.000Z',
		grantStartedAt: '2026-11-01T00:00:00.000Z',
		lastRefreshError: null,
		...extra,
	});
}

beforeEach(async () => {
	push.mockClear();
	for (const c of ['car', 'odometer', 'private', 'status']) await db.recursiveDelete(db.collection(c));
	await seedVolvo();
});

describe('runPollCar', () => {
	it('writes car/state with vinLast4 only and the odometer by local date', async () => {
		await runPollCar(NOON, { client: stubClient() });
		const snap = await db.doc('car/state').get();
		expect(snap.data()?.vinLast4).toBe(FULL_VIN.slice(-4));
		expect(JSON.stringify(snap.data())).not.toContain(FULL_VIN);
		expect(snap.data()?.battery.value.percent).toBe(62);
		const odo = (await db.doc('odometer/2026-11-06').get()).data();
		expect(odo?.km).toBe(23456);
		expect(typeof odo?.at).toBe('string');
		expect((await db.doc('car/odometer').get()).exists).toBe(false);
	});

	it('still writes the battery when /doors answers 500', async () => {
		const client = stubClient({
			section: vi.fn(async (_v: string, name: string) => (name === 'doors' ? undefined : fx(name))),
		});
		await runPollCar(NOON, { client });
		const data = (await db.doc('car/state').get()).data();
		expect(data?.battery.value.percent).toBe(62);
		expect(data?.locked).toBeNull();
	});

	it('does not overwrite car/state when every section fails', async () => {
		await db.doc('car/state').set({ vinLast4: '0001', marker: true });
		const client = stubClient({
			vehicles: vi.fn(async () => fx('vehicles')),
			section: vi.fn(async () => undefined),
			energy: vi.fn(async () => undefined),
			location: vi.fn(async () => undefined),
		});
		await runPollCar(NOON, { client });
		expect((await db.doc('car/state').get()).data()?.marker).toBe(true);
	});

	it('sends one leftOpen push at night and none on the second run', async () => {
		await runPollCar(NIGHT, { client: stubClient() });
		expect(push).toHaveBeenCalledTimes(1);
		const arg = (push.mock.calls as unknown as [Record<string, string>][])[0][0];
		expect(arg.kind).toBe('leftOpen');
		expect(arg.url).toBe('/car');
		expect(arg.dedupeKey).toMatch(/^leftOpen:2026-11-06:.*unlocked/);
		expect((await db.doc('private/leftOpen').get()).data()?.lastKey).toContain('unlocked');
		await runPollCar('2026-11-06T22:10:00.000Z', { client: stubClient() });
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('sends no leftOpen push by day', async () => {
		await runPollCar(NOON, { client: stubClient() });
		expect(push).not.toHaveBeenCalled();
	});

	it('pushes reconnect and writes no car/state on VolvoReconnectRequired', async () => {
		const client = stubClient({
			vehicles: vi.fn(async () => {
				throw new VolvoReconnectRequired();
			}),
		});
		await runPollCar(NOON, { client });
		expect(push).toHaveBeenCalledTimes(1);
		const arg = (push.mock.calls as unknown as [Record<string, string>][])[0][0];
		expect(arg).toMatchObject({
			kind: 'reconnect',
			url: '/settings',
			dedupeKey: 'reconnect:failed:2026-11-01T00:00:00.000Z',
		});
		expect((await db.doc('car/state').get()).exists).toBe(false);
	});

	it('pushes reconnect:due once the grant nears its 3-month end', async () => {
		await seedVolvo({ grantStartedAt: '2026-08-01T00:00:00.000Z' });
		await runPollCar(NOON, { client: stubClient() });
		const keys = (push.mock.calls as unknown as [Record<string, string>][]).map(c => c[0].dedupeKey);
		expect(keys).toContain('reconnect:due:2026-08-01T00:00:00.000Z');
		expect((await db.doc('car/state').get()).exists).toBe(true);
	});

	it('returns without calling Volvo when not connected or the dead token has expired', async () => {
		const client = stubClient();
		await db.doc('private/volvo').delete();
		await runPollCar(NOON, { client });
		await seedVolvo({ lastRefreshError: 'refresh rejected (400)', accessExpiresAt: '2026-11-06T10:00:00.000Z' });
		await runPollCar(NOON, { client });
		expect(client.vehicles).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});
});

describe('createVolvoClient', () => {
	it('sends the api key and bearer, and resolves undefined on a failed section', async () => {
		const fetchFn = vi.fn(async (url: string | URL | Request) =>
			String(url).endsWith('/doors')
				? new Response('{}', { status: 500 })
				: new Response('{"ok":1}', { status: 200 })
		);
		const c = createVolvoClient('KEY', async () => 'TOK', fetchFn as unknown as typeof fetch);
		expect(await c.section(FULL_VIN, 'doors')).toBeUndefined();
		expect(await c.section(FULL_VIN, 'odometer')).toEqual({ ok: 1 });
		const headers = (fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<
			string,
			string
		>;
		expect(headers['vcc-api-key']).toBe('KEY');
		expect(headers.Authorization).toBe('Bearer TOK');
	});

	it('rejects unknown commands such as unlock', async () => {
		const fetchFn = vi.fn();
		const c = createVolvoClient('K', async () => 'T', fetchFn as unknown as typeof fetch);
		await expect(c.command(FULL_VIN, 'unlock' as never)).rejects.toThrow();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('posts a supported command', async () => {
		const fetchFn = vi.fn(
			async () => new Response(JSON.stringify({ data: { invokeStatus: 'COMPLETED' } }), { status: 200 })
		);
		const c = createVolvoClient('K', async () => 'T', fetchFn as unknown as typeof fetch);
		expect(await c.command(FULL_VIN, 'lock')).toEqual({ ok: true, status: 'COMPLETED' });
		expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain('/commands/lock');
	});
});
