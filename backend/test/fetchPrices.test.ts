import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TARIFF } from '../../shared/testdata';
import { runFetchPrices } from '../src/fetchPrices';
import { db } from '../src/lib/firebase';
import { sendPush } from '../src/lib/push';
import { repriceAndUpdatePeaks } from '../src/lib/sessions';
import { elprisetUrl } from '../src/providers/elpriset';

const fixture = readFileSync(path.join(__dirname, 'fixtures/elpriset/2026-11-03_SE3.json'), 'utf8');
const NOW = '2026-11-03T10:30:00.000Z';

const stubFetch = (missing: string[] = []) =>
	vi.fn(async (url: string | URL | Request) =>
		missing.some(d => String(url).includes(d.slice(5)))
			? new Response('not found', { status: 404 })
			: new Response(fixture, { status: 200 })
	) as unknown as typeof fetch;

async function clearAll() {
	for (const c of ['prices', 'sessions', 'peaks', 'tariffs', 'config', 'private', 'users']) {
		await db.recursiveDelete(db.collection(c));
	}
}

const seedSession = (id: string, hourStartUtc: string, kWh: number) =>
	db.doc(`sessions/${id}`).set({
		startUtc: hourStartUtc,
		endUtc: new Date(Date.parse(hourStartUtc) + 3_600_000).toISOString(),
		kWh,
		hours: [{ hourStartUtc, kWh }],
		status: 'pending',
		cost: null,
		peakShare: 0,
	});

beforeEach(clearAll);

describe('elprisetUrl', () => {
	it('uses year/MM-DD_SE3', () => {
		expect(elprisetUrl('2026-11-03')).toBe('https://www.elprisetjustnu.se/api/v1/prices/2026/11-03_SE3.json');
	});
});

describe('runFetchPrices', () => {
	it('writes today/tomorrow and the missing last 7 days, then is idempotent', async () => {
		const onTomorrowArrived = vi.fn(async () => {});
		const first = await runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived });
		expect(first.written).toContain('2026-11-03');
		expect(first.written).toContain('2026-11-04');
		expect(first.written).toHaveLength(9);
		expect(first.tomorrowArrived).toBe(true);
		expect(onTomorrowArrived).toHaveBeenCalledTimes(1);
		expect((await db.doc('prices/2026-11-03').get()).data()?.date).toBe('2026-11-03');

		const fetchFn = stubFetch();
		const second = await runFetchPrices(NOW, { fetchFn, onTomorrowArrived });
		expect(second.written).toEqual([]);
		expect(second.tomorrowArrived).toBe(false);
		expect(fetchFn).not.toHaveBeenCalled();
		expect(onTomorrowArrived).toHaveBeenCalledTimes(1);
	});

	it('isolates a throwing onTomorrowArrived but still reports the run as failed', async () => {
		const onTomorrowArrived = vi.fn(async () => {
			throw new Error('boom');
		});
		await expect(runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived })).rejects.toThrow(/tomorrow hook failed/);
		expect(onTomorrowArrived).toHaveBeenCalledTimes(1);
		expect((await db.doc('prices/2026-11-04').get()).exists).toBe(true);
	});

	it('survives a 404 for tomorrow', async () => {
		const onTomorrowArrived = vi.fn(async () => {});
		const r = await runFetchPrices(NOW, { fetchFn: stubFetch(['2026-11-04']), onTomorrowArrived });
		expect(r.tomorrowArrived).toBe(false);
		expect(r.written).not.toContain('2026-11-04');
		expect(onTomorrowArrived).not.toHaveBeenCalled();
	});

	it('prices a pending session once its day is written and updates peaks', async () => {
		await db.doc('tariffs/t1').set(TEST_TARIFF);
		await seedSession('s1', '2026-11-03T10:00:00.000Z', 5);
		const r = await runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived: async () => {} });
		expect(r.repriced).toEqual(['s1']);
		const s = (await db.doc('sessions/s1').get()).data()!;
		expect(s.status).toBe('priced');
		expect(s.cost.total).toBeGreaterThan(0);
		const peaks = (await db.doc('peaks/2026-11').get()).data()!;
		expect(peaks.top3[0].kW).toBe(5);
		expect(s.peakShare).toBeCloseTo(peaks.estimatedFee, 6);
	});
});

describe('runFetchPrices resilience', () => {
	it('re-prices sessions pending for a missing tariff without writing prices', async () => {
		await runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived: async () => {} });
		await seedSession('s1', '2026-11-03T10:00:00.000Z', 5);
		await runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived: async () => {} });
		expect((await db.doc('sessions/s1').get()).data()!.status).toBe('pending');
		await db.doc('tariffs/t1').set(TEST_TARIFF);
		const r = await runFetchPrices(NOW, { fetchFn: stubFetch(), onTomorrowArrived: async () => {} });
		expect(r.written).toEqual([]);
		expect((await db.doc('sessions/s1').get()).data()!.status).toBe('priced');
	});

	it('continues past a failed day, then rejects', async () => {
		const fetchFn = vi.fn(async (url: string | URL | Request) =>
			String(url).includes('11-04')
				? new Response('boom', { status: 500 })
				: new Response(fixture, { status: 200 })
		) as unknown as typeof fetch;
		await expect(runFetchPrices(NOW, { fetchFn, onTomorrowArrived: async () => {} })).rejects.toThrow('2026-11-04');
		expect((await db.doc('prices/2026-10-31').get()).exists).toBe(true);
		expect((await db.doc('prices/2026-11-04').get()).exists).toBe(false);
	});
});

describe('repriceAndUpdatePeaks', () => {
	it('splits the fee between sessions of a month and stays pending without prices', async () => {
		await db.doc('tariffs/t1').set(TEST_TARIFF);
		await seedSession('a', '2026-11-03T10:00:00.000Z', 6);
		await seedSession('b', '2026-11-04T10:00:00.000Z', 3);
		await repriceAndUpdatePeaks(['a']);
		const a = (await db.doc('sessions/a').get()).data()!;
		const b = (await db.doc('sessions/b').get()).data()!;
		expect(a.status).toBe('pending');
		const fee = (await db.doc('peaks/2026-11').get()).data()!.estimatedFee;
		expect(a.peakShare + b.peakShare).toBeCloseTo(fee, 6);
		expect(a.peakShare / b.peakShare).toBeCloseTo(2, 6);
		await repriceAndUpdatePeaks(['a']);
		expect((await db.doc('peaks/2026-11').get()).data()!.estimatedFee).toBeCloseTo(fee, 9);
	});

	it('skips peaks when no tariff applies', async () => {
		await seedSession('a', '2026-11-03T10:00:00.000Z', 6);
		await repriceAndUpdatePeaks(['a']);
		expect((await db.doc('peaks/2026-11').get()).exists).toBe(false);
	});
});

describe('sendPush', () => {
	const input = { kind: 'sessionDone' as const, title: 't', body: 'b', dedupeKey: 'k1', url: '/x' };
	const ok = { success: true };
	const messaging = (responses: unknown[]) => ({
		sendEachForMulticast: vi.fn(async () => ({ responses, successCount: 0, failureCount: 0 })),
	});

	it('sends once then reports duplicate', async () => {
		await db.doc('users/u1/pushTokens/tok1').set({ createdAt: 'x' });
		const m = messaging([ok]);
		expect(await sendPush(input, m as never)).toBe('sent');
		expect(await sendPush(input, m as never)).toBe('duplicate');
		expect(m.sendEachForMulticast).toHaveBeenCalledTimes(1);
		expect(m.sendEachForMulticast).toHaveBeenCalledWith({
			tokens: ['tok1'],
			notification: { title: 't', body: 'b' },
			data: { url: '/x', kind: 'sessionDone' },
			webpush: { fcmOptions: { link: 'https://volvo-calc-charger.vercel.app/x' } },
		});
	});

	it('is disabled by settings but reconnect is always on', async () => {
		await db.doc('config/settings').set({ notifications: { sessionDone: false } });
		const m = messaging([]);
		expect(await sendPush(input, m as never)).toBe('disabled');
		expect((await db.doc('private/notified/keys/k1').get()).exists).toBe(false);
		expect(await sendPush({ ...input, kind: 'reconnect', dedupeKey: 'k2' }, m as never)).toBe('sent');
	});

	it('deletes dead tokens and keeps good ones', async () => {
		await db.doc('users/u1/pushTokens/dead').set({});
		await db.doc('users/u2/pushTokens/good').set({});
		await db.doc('users/u3/pushTokens/bad').set({});
		const m = {
			sendEachForMulticast: vi.fn(async ({ tokens }: { tokens: string[] }) => ({
				responses: tokens.map(t => {
					if (t === 'dead') return { success: false, error: { code: 'messaging/registration-token-not-registered' } };
					if (t === 'bad') return { success: false, error: { code: 'messaging/invalid-registration-token' } };
					return ok;
				}),
			})),
		};
		await sendPush(input, m as never);
		expect((await db.doc('users/u1/pushTokens/dead').get()).exists).toBe(false);
		expect((await db.doc('users/u3/pushTokens/bad').get()).exists).toBe(false);
		expect((await db.doc('users/u2/pushTokens/good').get()).exists).toBe(true);
	});

	it('releases the dedupe key when FCM throws so a retry can send', async () => {
		await db.doc('users/u1/pushTokens/tok1').set({});
		const bad = { sendEachForMulticast: vi.fn(async () => { throw new Error('fcm down'); }) };
		await expect(sendPush(input, bad as never)).rejects.toThrow('fcm down');
		expect((await db.doc('private/notified/keys/k1').get()).exists).toBe(false);
		expect(await sendPush(input, messaging([ok]) as never)).toBe('sent');
	});

	it('records dedupe even with no tokens', async () => {
		const m = messaging([]);
		expect(await sendPush(input, m as never)).toBe('sent');
		expect(m.sendEachForMulticast).not.toHaveBeenCalled();
		expect(await sendPush(input, m as never)).toBe('duplicate');
	});
});
