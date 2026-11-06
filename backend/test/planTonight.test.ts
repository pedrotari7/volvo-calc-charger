import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_TARIFF } from '../../shared/testdata';
import { localParts } from '../../shared/time';
import type { PriceDay } from '../../shared/types';
import { db } from '../src/lib/firebase';
import { runPlanTonight } from '../src/planTonight';

const push = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../src/lib/push', () => ({ sendPush: push }));

const HOUR = 3_600_000;
const NOW = '2026-11-03T17:00:00.000Z'; // 18:00 local, Tuesday
const pad = (n: number) => String(n).padStart(2, '0');

function priceDay(date: string, price: (localHour: number) => number): PriceDay {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const quarters: PriceDay['quarters'] = [];
	for (let t = Date.UTC(y, m - 1, d) - 2 * HOUR; t < Date.UTC(y, m - 1, d) + 26 * HOUR; t += HOUR / 4) {
		const iso = new Date(t).toISOString();
		const lp = localParts(iso);
		if (lp.date !== date) continue;
		const off = (lp.hour - new Date(t).getUTCHours() + 24) % 24;
		quarters.push({
			start: `${date}T${pad(lp.hour)}:${pad(new Date(t).getUTCMinutes())}:00+${pad(off)}:00`,
			sekPerKwhExVat: price(lp.hour),
		});
	}
	return { date, quarters };
}

const cheapNight = (h: number) => (h >= 1 && h < 4 ? 0.1 : 2);

async function seed({ battery = 62, pluggedIn = false, tomorrow = false } = {}) {
	await db.doc('tariffs/t1').set(TEST_TARIFF);
	await db.doc('prices/2026-11-03').set(priceDay('2026-11-03', () => 2));
	if (tomorrow) await db.doc('prices/2026-11-04').set(priceDay('2026-11-04', cheapNight));
	await db.doc('car/state').set({ battery: { value: { percent: battery }, at: NOW } });
	await db.doc('charger/state').set({ pluggedIn, charging: false, liveKw: 0, sessionKwh: 0, updatedAt: NOW });
}

beforeEach(async () => {
	push.mockClear();
	for (const c of ['prices', 'tariffs', 'car', 'charger', 'config', 'peaks', 'plans']) {
		await db.recursiveDelete(db.collection(c));
	}
});

describe('runPlanTonight', () => {
	it('writes the plan and sends a plug-in push with local times and whole kr', async () => {
		await seed({ tomorrow: true });
		const plan = await runPlanTonight(NOW);
		expect(plan?.basis).toBe('tomorrow');
		expect((await db.doc('plans/2026-11-03').get()).data()).toEqual(JSON.parse(JSON.stringify(plan)));
		expect(push).toHaveBeenCalledTimes(1);
		const arg = (push.mock.calls[0] as unknown as [Record<string, string>])[0];
		expect(arg).toMatchObject({ kind: 'plugIn', title: 'Charge tonight', dedupeKey: 'plugIn:2026-11-03', url: '/' });
		expect(arg.body).toMatch(/^62% → 80%: plug in, cheapest 0\d:00–0\d:00, ≈ \d+ kr$/);
		const r = plan!.recommendation!;
		const hhmm = (iso: string) => `${pad(localParts(iso).hour)}:00`;
		expect(arg.body).toBe(
			`62% → 80%: plug in, cheapest ${hhmm(r.start)}–${hhmm(r.end)}, ≈ ${Math.round(r.cost)} kr`
		);
	});

	it('writes the plan but sends no push when already plugged in', async () => {
		await seed({ tomorrow: true, pluggedIn: true });
		await runPlanTonight(NOW);
		expect((await db.doc('plans/2026-11-03').get()).exists).toBe(true);
		expect(push).not.toHaveBeenCalled();
	});

	it('is called again the same evening and relies on the push dedupe key', async () => {
		await seed({ tomorrow: true });
		await runPlanTonight(NOW);
		await runPlanTonight(NOW);
		for (const c of push.mock.calls as unknown as Array<[{ dedupeKey: string }]>) {
			expect(c[0].dedupeKey).toBe('plugIn:2026-11-03');
		}
	});

	it('overwrites the plan with basis tomorrow once tomorrow arrives', async () => {
		await seed();
		const first = await runPlanTonight(NOW);
		expect(first?.basis).toBe('today');
		await db.doc('prices/2026-11-04').set(priceDay('2026-11-04', cheapNight));
		await runPlanTonight('2026-11-03T18:30:00.000Z');
		expect((await db.doc('plans/2026-11-03').get()).data()?.basis).toBe('tomorrow');
	});

	it('sends no push when the battery is above target', async () => {
		await seed({ battery: 90, tomorrow: true });
		const plan = await runPlanTonight(NOW);
		expect(plan?.recommendation).toBeNull();
		expect(plan?.chargeNow).toBe(false);
		expect(push).not.toHaveBeenCalled();
	});

	it('chargeNow body when there is no time to wait', async () => {
		await seed({ battery: 20, tomorrow: true });
		await db.doc('config/settings').set({ readyBy: '19:00' });
		const plan = await runPlanTonight(NOW);
		expect(plan?.chargeNow).toBe(true);
		const arg = (push.mock.calls[0] as unknown as [Record<string, string>])[0];
		expect(arg.body).toBe('20% → 80%: plug in now, not enough time to wait for cheap hours');
	});

	it('returns null and writes nothing without battery data', async () => {
		await seed({ tomorrow: true });
		await db.doc('car/state').delete();
		expect(await runPlanTonight(NOW)).toBeNull();
		expect((await db.collection('plans').get()).empty).toBe(true);
		expect(push).not.toHaveBeenCalled();
	});
});
