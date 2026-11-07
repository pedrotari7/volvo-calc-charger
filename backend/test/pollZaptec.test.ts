import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TARIFF } from '../../shared/testdata';
import type { ChargerState } from '../../shared/types';
import { db } from '../src/lib/firebase';
import { runPollZaptec } from '../src/pollZaptec';
import type { ZaptecClient } from '../src/providers/zaptec';
import { createZaptecClient, mapChargerState } from '../src/providers/zaptec';

const fx = (p: string) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures', p), 'utf8'));
const history = fx('zaptec/chargehistory.json');
const NOW = '2026-11-03T09:00:00.000Z';
const state: ChargerState = { pluggedIn: false, charging: false, liveKw: 0, sessionKwh: 0, updatedAt: NOW };

const stubClient = (page: unknown = history): ZaptecClient => ({
	history: vi.fn(async () => page),
	chargerState: vi.fn(async () => state),
});

const push = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../src/lib/push', () => ({ sendPush: push }));

async function seedPrices() {
	const day = fx('elpriset/2026-11-03_SE3.json');
	const { parseElpriset } = await import('../../shared/prices');
	for (const d of ['2026-11-02', '2026-11-03']) await db.doc(`prices/${d}`).set(parseElpriset(d, day));
}

beforeEach(async () => {
	push.mockClear();
	for (const c of ['prices', 'sessions', 'peaks', 'tariffs', 'plans', 'charger', 'status', 'private']) {
		await db.recursiveDelete(db.collection(c));
	}
	await db.doc('tariffs/t1').set(TEST_TARIFF);
});

describe('runPollZaptec', () => {
	it('creates 4 sessions and pushes only the recent one, then nothing on the second run', async () => {
		await seedPrices();
		const r1 = await runPollZaptec(NOW, { client: stubClient() });
		expect(r1.newSessions).toHaveLength(4);
		expect((await db.collection('sessions').get()).size).toBe(4);
		// Only 5e1f… ended within 24 h of NOW; the older ones are written as already notified.
		expect(push).toHaveBeenCalledTimes(1);
		const calls = push.mock.calls as unknown as [{ dedupeKey: string; url: string; kind: string }][];
		expect(calls[0][0].dedupeKey).toBe('session:5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5');
		expect(calls[0][0].url).toMatch(/^\/history\//);
		const docs = (await db.collection('sessions').get()).docs;
		expect(docs.every(d => d.data().notified === true)).toBe(true);

		const peaksBefore = (await db.doc('peaks/2026-11').get()).data();
		const sharesBefore = (await db.collection('sessions').get()).docs.map(d => [d.id, d.data().peakShare]);
		push.mockClear();
		const r2 = await runPollZaptec('2026-11-03T09:05:00.000Z', { client: stubClient() });
		expect(r2.newSessions).toEqual([]);
		expect(push).not.toHaveBeenCalled();
		expect((await db.doc('peaks/2026-11').get()).data()).toEqual(peaksBefore);
		expect((await db.collection('sessions').get()).docs.map(d => [d.id, d.data().peakShare])).toEqual(sharesBefore);
	});

	it('prices a session with prices and says so in the push', async () => {
		await seedPrices();
		await runPollZaptec(NOW, { client: stubClient() });
		const id = '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5';
		const s = (await db.doc(`sessions/${id}`).get()).data()!;
		expect(s.status).toBe('priced');
		expect(s.cost.total).toBeGreaterThan(0);
		const call = (push.mock.calls as unknown as [{ dedupeKey: string; body: string }][]).find(
			c => c[0].dedupeKey === `session:${id}`
		)!;
		expect(call[0].body).toMatch(/^Charged 11,9 kWh for .+ kr \(.+ kr\/kWh\)$/);
	});

	it('does not flood pushes on first deploy: sessions that ended over 24 h ago are written as notified', async () => {
		const id = '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5';
		const one = { Pages: 1, Data: [history.Data.find((d: { Id: string }) => d.Id === id)] };
		await runPollZaptec('2026-11-04T08:31:00.000Z', { client: stubClient(one) }); // 24 h 0 min after end
		expect(push).not.toHaveBeenCalled();
		expect((await db.doc(`sessions/${id}`).get()).data()!.notified).toBe(true);
		await db.recursiveDelete(db.collection('sessions'));
		await runPollZaptec('2026-11-04T08:30:00.000Z', { client: stubClient(one) }); // just under 24 h
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('writes pending sessions with a price pending push when prices are missing', async () => {
		await runPollZaptec(NOW, { client: stubClient() });
		const docs = (await db.collection('sessions').get()).docs;
		expect(docs.every(d => d.data().status === 'pending' && d.data().cost === null)).toBe(true);
		const bodies = (push.mock.calls as unknown as [{ body: string }][]).map(c => c[0].body);
		expect(bodies).toContain('Charged 11,9 kWh, price pending');
	});

	it('attaches the plan of the previous evening to a session starting after midnight', async () => {
		// Session 5e1f… starts 2026-11-02T23:02Z = 00:02 local on 3 Nov, so it belongs to the 2 Nov evening plan.
		const rec = { kw: 3.6, start: '2026-11-02T23:00:00.000Z', end: '2026-11-03T07:00:00.000Z', energyCost: 10.25, peakIncrease: 2.25, cost: 12.5 };
		await db.doc('plans/2026-11-02').set({ recommendation: rec });
		await db.doc('plans/2026-11-03').set({ recommendation: { ...rec, cost: 99, energyCost: 99 } });
		await runPollZaptec(NOW, { client: stubClient() });
		const id = '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5';
		expect((await db.doc(`sessions/${id}`).get()).data()!.planned).toEqual({
			kw: 3.6, start: rec.start, end: rec.end, energyCost: 10.25, cost: 12.5,
		});
		const other = '0b8d2e64-91a7-4f3c-b5e0-7a4c1d83f926';
		expect((await db.doc(`sessions/${other}`).get()).data()!.planned).toBeNull();
	});

	it('does not attach a plan whose window the session start lies outside, or a plan without recommendation', async () => {
		const id = '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5';
		const one = { Pages: 1, Data: [history.Data.find((d: { Id: string }) => d.Id === id)] };
		// Window is [start - 3 h, end] = [00:01Z, 07:00Z]; the session starts 23:02Z the day before.
		const rec = { kw: 3.6, start: '2026-11-03T03:01:00.000Z', end: '2026-11-03T07:00:00.000Z', energyCost: 1, peakIncrease: 0, cost: 1 };
		await db.doc('plans/2026-11-02').set({ recommendation: rec });
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect((await db.doc(`sessions/${id}`).get()).data()!.planned).toBeNull();

		await db.recursiveDelete(db.collection('sessions'));
		await db.doc('plans/2026-11-02').set({ recommendation: { ...rec, start: '2026-11-03T02:02:05.187Z' } });
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect((await db.doc(`sessions/${id}`).get()).data()!.planned).toMatchObject({ energyCost: 1 });

		await db.recursiveDelete(db.collection('sessions'));
		await db.doc('plans/2026-11-02').set({ recommendation: null, chargeNow: true });
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect((await db.doc(`sessions/${id}`).get()).data()!.planned).toBeNull();
	});

	it('writes charger/state and status/zaptec', async () => {
		const s = { pluggedIn: true, charging: true, liveKw: 11.04, sessionKwh: 4.25, updatedAt: NOW };
		const client = { history: vi.fn(async () => history), chargerState: vi.fn(async () => s) };
		await runPollZaptec(NOW, { client });
		expect((await db.doc('charger/state').get()).data()).toEqual(s);
		expect((await db.doc('status/zaptec').get()).data()).toEqual({ lastOkAt: NOW });
	});

	it('on a malformed page still writes charger state but not status', async () => {
		const r = await runPollZaptec(NOW, { client: stubClient({ nope: true }) });
		expect(r.newSessions).toEqual([]);
		expect((await db.doc('charger/state').get()).exists).toBe(true);
		expect((await db.doc('status/zaptec').get()).exists).toBe(false);
	});
});

describe('runPollZaptec resilience', () => {
	it('keeps polling sessions when chargerState fails, without writing charger state or lastOkAt', async () => {
		const client = { history: vi.fn(async () => history), chargerState: vi.fn(async () => Promise.reject(new Error('zaptec 500'))) };
		const r = await runPollZaptec(NOW, { client });
		expect(r.newSessions).toHaveLength(4);
		expect((await db.doc('charger/state').get()).exists).toBe(false);
		expect((await db.doc('status/zaptec').get()).exists).toBe(false);
	});

	it('skips a malformed session row and keeps the others', async () => {
		const bad = { ...history.Data[0], Id: 'bad-row', StartDateTime: 'garbage' };
		const r = await runPollZaptec(NOW, { client: stubClient({ Pages: 1, Data: [bad, ...history.Data] }) });
		expect(r.newSessions).toHaveLength(4);
		expect((await db.doc('sessions/bad-row').get()).exists).toBe(false);
	});
});

describe('runPollZaptec notification retry', () => {
	const ID = '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5';
	const one = { Pages: 1, Data: [history.Data.find((d: { Id: string }) => d.Id === ID)] };

	it('retries the push on the next poll when sendPush throws', async () => {
		await seedPrices();
		push.mockRejectedValueOnce(new Error('fcm down'));
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect((await db.doc(`sessions/${ID}`).get()).data()!.notified).toBe(false);
		expect((await db.doc('status/zaptec').get()).exists).toBe(false);
		push.mockClear();
		const r = await runPollZaptec(NOW, { client: stubClient(one) });
		expect(r.newSessions).toEqual([]);
		expect(push).toHaveBeenCalledTimes(1);
		expect((push.mock.calls as unknown as [{ dedupeKey: string }][])[0][0].dedupeKey).toBe(`session:${ID}`);
		expect((await db.doc(`sessions/${ID}`).get()).data()!.notified).toBe(true);
		expect((await db.doc('status/zaptec').get()).exists).toBe(true);
	});

	it('still pushes after a pricing failure, and notifies once in total', async () => {
		await seedPrices();
		const sessions = await import('../src/lib/sessions');
		const spy = vi.spyOn(sessions, 'repriceAndUpdatePeaks').mockRejectedValueOnce(new Error('boom'));
		await runPollZaptec(NOW, { client: stubClient(one) });
		spy.mockRestore();
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect(push).toHaveBeenCalledTimes(1);
		expect((await db.doc(`sessions/${ID}`).get()).data()!.notified).toBe(true);
	});

	it('updates a known session whose kWh or hours changed, reprices it, and leaves notified alone', async () => {
		await seedPrices();
		await runPollZaptec(NOW, { client: stubClient(one) });
		const before = (await db.doc(`sessions/${ID}`).get()).data()!;
		expect(before.notified).toBe(true);
		const feeBefore = (await db.doc('peaks/2026-11').get()).data()!.estimatedFee;

		const row = one.Data[0];
		const details = row.EnergyDetails.map((d: { Timestamp: string; Energy: number }, i: number) =>
			i === 2 ? { ...d, Energy: d.Energy + 3 } : d
		);
		const grown = { Pages: 1, Data: [{ ...row, Energy: row.Energy + 3, EndDateTime: '2026-11-03T08:45:00', EnergyDetails: details }] };
		const r = await runPollZaptec('2026-11-03T09:05:00.000Z', { client: stubClient(grown) });
		expect(r.newSessions).toEqual([]);
		const after = (await db.doc(`sessions/${ID}`).get()).data()!;
		expect(after.kWh).toBeCloseTo(before.kWh + 3, 9);
		expect(after.endUtc).toBe('2026-11-03T08:45:00.000Z');
		expect(after.hours).not.toEqual(before.hours);
		expect(after.status).toBe('priced');
		expect(after.cost.total).toBeGreaterThan(before.cost.total);
		expect(after.notified).toBe(true);
		expect(push).toHaveBeenCalledTimes(1);
		expect((await db.doc('peaks/2026-11').get()).data()!.estimatedFee).toBeGreaterThan(feeBefore);
	});

	it('marks a changed session pending when its new hours have no prices', async () => {
		await seedPrices();
		await runPollZaptec(NOW, { client: stubClient(one) });
		const row = one.Data[0];
		const late = { Timestamp: '2026-11-04T02:00:00.000+00:00', Energy: 1 };
		const grown = { Pages: 1, Data: [{ ...row, Energy: row.Energy + 1, EndDateTime: '2026-11-04T02:00:00', EnergyDetails: [...row.EnergyDetails, late] }] };
		await runPollZaptec('2026-11-04T03:00:00.000Z', { client: stubClient(grown) });
		const after = (await db.doc(`sessions/${ID}`).get()).data()!;
		expect(after.status).toBe('pending');
		expect(after.notified).toBe(true);
	});

	it('a session pushed as pending and priced later is not pushed again', async () => {
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect(push).toHaveBeenCalledTimes(1);
		expect((await db.doc(`sessions/${ID}`).get()).data()!.status).toBe('pending');
		await seedPrices();
		const { repriceAndUpdatePeaks } = await import('../src/lib/sessions');
		await repriceAndUpdatePeaks([ID]);
		await runPollZaptec(NOW, { client: stubClient(one) });
		expect(push).toHaveBeenCalledTimes(1);
		expect((await db.doc(`sessions/${ID}`).get()).data()!.status).toBe('priced');
	});
});

describe('zaptec client', () => {
	const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
	const stub = (expires = 86399) => {
		const token = { ...fx('zaptec/token.json'), expires_in: expires };
		return vi.fn(async (url: string | URL | Request) => {
			const u = String(url);
			if (u.endsWith('/oauth/token')) return json(token);
			if (u.endsWith('/api/chargers')) return json(fx('zaptec/chargers.json'));
			if (u.endsWith('/state')) return json(fx('zaptec/state.json').data);
			return json(history);
		});
	};

	it('maps state observations', async () => {
		const f = stub();
		const c = createZaptecClient({ username: 'u', password: 'p' }, f as unknown as typeof fetch);
		const s = await c.chargerState();
		expect(s).toMatchObject({ pluggedIn: true, charging: true, liveKw: 11.04, sessionKwh: 4.25 });
	});

	it('maps operation modes', () => {
		const m = (v: string) => mapChargerState([{ StateId: 710, ValueAsString: v }], 'x');
		expect([m('1').pluggedIn, m('1').charging]).toEqual([false, false]);
		expect([m('2').pluggedIn, m('2').charging]).toEqual([true, false]);
		expect([m('5').pluggedIn, m('5').charging]).toEqual([true, false]);
	});

	it('posts a form-encoded password grant, caches the token, and calls history with the right query', async () => {
		const f = stub();
		const c = createZaptecClient({ username: 'u', password: 'p' }, f as unknown as typeof fetch);
		await c.history();
		await c.history();
		const tokenCalls = f.mock.calls.filter(x => String(x[0]).endsWith('/oauth/token'));
		expect(tokenCalls).toHaveLength(1);
		const init = tokenCalls[0][1] as RequestInit;
		expect(init.method).toBe('POST');
		expect(String(init.body)).toBe('grant_type=password&username=u&password=p');
		expect(String(f.mock.calls[1][0])).toBe(
			'https://api.zaptec.com/api/chargehistory?DetailLevel=1&PageSize=20&SortDescending=true'
		);
	});

	it('refreshes the token when within 5 minutes of expiry', async () => {
		const f = stub(200);
		const c = createZaptecClient({ username: 'u', password: 'p' }, f as unknown as typeof fetch);
		await c.history();
		await c.history();
		expect(f.mock.calls.filter(x => String(x[0]).endsWith('/oauth/token'))).toHaveLength(2);
	});

	it('does not leak credentials in errors', async () => {
		const f = vi.fn(async () => new Response('no', { status: 401 }));
		const c = createZaptecClient({ username: 'secret-user', password: 'secret-pw' }, f as unknown as typeof fetch);
		await expect(c.history()).rejects.toThrow(/^zaptec: token HTTP 401$/);
	});
});
