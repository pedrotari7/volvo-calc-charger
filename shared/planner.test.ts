import { describe, expect, it } from 'vitest';
import { computeMonthPeaks } from './peaks';
import { planTonight } from './planner';
import { TEST_TARIFF } from './testdata';
import { localParts } from './time';
import type { MonthPeaks, PlanCandidate, PriceDay, Session, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Every quarter of a local day (92/96/100), `start` keeping the local offset. */
function priceDay(date: string, price: (localHour: number) => number): PriceDay {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const quarters: PriceDay['quarters'] = [];
	for (let t = Date.UTC(y, m - 1, d) - 2 * HOUR; t < Date.UTC(y, m - 1, d) + 26 * HOUR; t += HOUR / 4) {
		const iso = new Date(t).toISOString();
		const lp = localParts(iso);
		if (lp.date !== date) continue;
		const off = (lp.hour - new Date(t).getUTCHours() + 24) % 24;
		const min = new Date(t).getUTCMinutes();
		quarters.push({
			start: `${date}T${pad(lp.hour)}:${pad(min)}:00+${pad(off)}:00`,
			sekPerKwhExVat: price(lp.hour),
		});
	}
	return { date, quarters };
}

const flat = () => 1;
const flatDays = (): Record<string, PriceDay> => ({
	'2026-11-03': priceDay('2026-11-03', flat),
	'2026-11-04': priceDay('2026-11-04', flat),
});
/** Peaks for `month` built from an old session on the 1st of that month. */
const peaksOf = (kws: number[], month = '2026-11'): Record<string, MonthPeaks> => {
	const first = Date.parse(`${month}-01T00:00:00.000Z`);
	const s: Session = {
		id: 'old',
		startUtc: new Date(first).toISOString(),
		endUtc: new Date(first + kws.length * HOUR).toISOString(),
		kWh: kws.reduce((a, b) => a + b, 0),
		hours: kws.map((kWh, i) => ({ hourStartUtc: new Date(first + i * HOUR).toISOString(), kWh })),
	};
	return { [month]: computeMonthPeaks(month, [s], TEST_TARIFF) };
};
const perKw = 45.216 * 1.25;

const NOW = '2026-11-03T17:00:00.000Z'; // 18:00 local, Tuesday
const plan = (o: {
	nowUtc?: string;
	batteryPercent?: number;
	settings?: Partial<Settings>;
	days?: Record<string, PriceDay>;
	peaksByMonth?: Record<string, MonthPeaks>;
}) =>
	planTonight({
		nowUtc: o.nowUtc ?? NOW,
		batteryPercent: o.batteryPercent ?? 62,
		settings: { ...DEFAULT_SETTINGS, ...o.settings },
		days: o.days ?? flatDays(),
		tariffs: [TEST_TARIFF],
		peaksByMonth: o.peaksByMonth ?? {},
	});

const hoursOf = (c: PlanCandidate) => (Date.parse(c.end) - Date.parse(c.start)) / HOUR;

describe('planTonight', () => {
	it('computes neededKwh, date and basis', () => {
		const p = plan({});
		expect(p.neededKwh).toBe(15);
		expect(p.date).toBe('2026-11-03');
		expect(p.batteryPercent).toBe(62);
		expect(p.basis).toBe('tomorrow');
		expect(p.chargeNow).toBe(false);
	});

	it('rounds neededKwh to 0.1', () => {
		// 17% of 75 / 0.9 = 14.1666...
		expect(plan({ batteryPercent: 63 }).neededKwh).toBe(14.2);
	});

	it('flat price, empty peaks: reduced kW wins on peak fee', () => {
		const p = plan({});
		const r = p.recommendation!;
		const a = p.alternative!;
		expect(r.kw).toBe(3.7);
		expect(hoursOf(r)).toBe(5);
		expect(a.kw).toBe(11);
		expect(hoursOf(a)).toBe(2);
		expect(r.peakIncrease).toBeLessThan(a.peakIncrease);
		expect(r.cost).toBeCloseTo(r.energyCost + r.peakIncrease, 9);
		// all five hours in low load: 15 kWh × (1 + 0.05 + 0.0736 + 0.36) × 1.25
		expect(r.energyCost).toBeCloseTo(15 * 1.4836 * 1.25, 6);
		// 3 × 3.7 kW added to empty peaks
		expect(r.peakIncrease).toBeCloseTo((11.1 / 3) * perKw, 6);
		expect(r.start).toBe('2026-11-03T21:00:00.000Z');
	});

	it('flat price, peaks [10,10,10]: 11 kW would raise the peak, so reduced kW wins', () => {
		// Brief expected kw 11 here, but an 11 kWh hour beats a 10 kW peak: +1/3 kW × 45.216 × 1.25.
		// The tie case the brief describes is pinned with peaks [11,11,11] below.
		const p = plan({ peaksByMonth: peaksOf([10, 10, 10]) });
		expect(p.recommendation!.kw).toBe(3.7);
		expect(p.recommendation!.peakIncrease).toBe(0);
		expect(p.alternative!.kw).toBe(11);
		expect(p.alternative!.start).toBe('2026-11-03T21:00:00.000Z');
		expect(p.alternative!.peakIncrease).toBeCloseTo((1 / 3) * perKw, 6);
	});

	it('flat price, peaks [11,11,11]: tie on cost goes to higher kW, first low-load start', () => {
		const p = plan({ peaksByMonth: peaksOf([11, 11, 11]) });
		const r = p.recommendation!;
		expect(r.kw).toBe(11);
		expect(r.peakIncrease).toBe(0);
		expect(r.start).toBe('2026-11-03T21:00:00.000Z');
		expect(r.end).toBe('2026-11-03T23:00:00.000Z');
		expect(p.alternative!.kw).toBe(3.7);
		expect(p.alternative!.cost).toBeCloseTo(r.cost, 9);
	});

	it('picks the cheap 02:00-04:00 local window', () => {
		const cheap = (h: number) => (h >= 2 && h < 4 ? 0.2 : 1);
		const p = plan({
			days: { '2026-11-03': priceDay('2026-11-03', cheap), '2026-11-04': priceDay('2026-11-04', cheap) },
			peaksByMonth: peaksOf([11, 11, 11]),
		});
		const r = p.recommendation!;
		expect(r.kw).toBe(11);
		expect(r.start).toBe('2026-11-04T01:00:00.000Z');
		expect(r.end).toBe('2026-11-04T03:00:00.000Z');
		expect(r.energyCost).toBeCloseTo((11 * 0.2 + 4 * 0.2 + 15 * 0.4836) * 1.25, 6);
	});

	it('needs nothing at or above target', () => {
		const p = plan({ batteryPercent: 85 });
		expect(p.neededKwh).toBe(0);
		expect(p.recommendation).toBeNull();
		expect(p.alternative).toBeNull();
		expect(p.chargeNow).toBe(false);
	});

	it('charges now when nothing fits before readyBy (reducedKw >= max is ignored)', () => {
		const p = plan({ batteryPercent: 5, settings: { chargerMaxKw: 3 } });
		expect(p.neededKwh).toBe(62.5);
		expect(p.chargeNow).toBe(true);
		expect(p.recommendation).toBeNull();
		expect(p.alternative).toBeNull();
	});

	it('has no alternative when reducedKw >= chargerMaxKw', () => {
		const p = plan({ settings: { reducedKw: 11 } });
		expect(p.recommendation!.kw).toBe(11);
		expect(p.alternative).toBeNull();
	});

	it('uses known prices only when tomorrow is missing', () => {
		const p = plan({ days: { '2026-11-03': priceDay('2026-11-03', flat) } });
		expect(p.basis).toBe('today');
		// 3.7 kW needs 5 hours; only hours up to 23:00Z (local midnight) are priced
		const r = p.recommendation!;
		expect(r.kw).toBe(3.7);
		expect(r.start).toBe('2026-11-03T18:00:00.000Z');
		expect(r.end).toBe('2026-11-03T23:00:00.000Z');
		// 11 kW: last start whose two hours are still on 3 Nov local is 21:00Z (22:00, 23:00 local)
		const a = p.alternative!;
		expect(a.kw).toBe(11);
		expect(a.start).toBe('2026-11-03T21:00:00.000Z');
		expect(a.end).toBe('2026-11-03T23:00:00.000Z');
	});

	it('makes no plan, and does not charge now, when it would fit but no prices are known', () => {
		const p = plan({ days: {} });
		expect(p.chargeNow).toBe(false);
		expect(p.basis).toBe('today');
		expect(p.recommendation).toBeNull();
		expect(p.alternative).toBeNull();
	});

	it('charges now on lack of time even when prices are missing', () => {
		const p = plan({ batteryPercent: 5, settings: { chargerMaxKw: 3 }, days: {} });
		expect(p.chargeNow).toBe(true);
		expect(p.recommendation).toBeNull();
	});

	it('starts at the next whole hour when now is past 18:00', () => {
		// Cheapest from 21:00 local (20:00Z), which is before now: the first allowed start is 21:00Z.
		const cheap = (h: number) => (h >= 21 ? 0.1 : 1);
		const p = plan({
			nowUtc: '2026-11-03T20:30:00.000Z',
			days: { '2026-11-03': priceDay('2026-11-03', cheap), '2026-11-04': priceDay('2026-11-04', flat) },
			peaksByMonth: peaksOf([11, 11, 11]),
		});
		const r = p.recommendation!;
		expect(r.kw).toBe(11);
		expect(r.start).toBe('2026-11-03T21:00:00.000Z');
		expect(r.end).toBe('2026-11-03T23:00:00.000Z');
	});

	it('starts at 18:00 local when called during the day', () => {
		// Daytime and 18:00 local are cheapest: a window starting at now would pick a daytime hour.
		const cheap = (h: number) => (h < 19 ? -1 : 1);
		const p = plan({
			nowUtc: '2026-11-03T09:12:00.000Z',
			batteryPercent: 5,
			settings: { chargerMaxKw: 11, reducedKw: 11 },
			days: { '2026-11-03': priceDay('2026-11-03', cheap), '2026-11-04': priceDay('2026-11-04', flat) },
		});
		// 62.5 kWh at 11 kW = 6 hours; window 17:00Z-06:00Z
		expect(p.chargeNow).toBe(false);
		expect(p.recommendation!.start).toBe('2026-11-03T17:00:00.000Z');
		expect(p.date).toBe('2026-11-03');
	});

	it('starts now when called after midnight, before readyBy', () => {
		const p = plan({ nowUtc: '2026-11-04T00:00:00.000Z', peaksByMonth: peaksOf([11, 11, 11]) });
		expect(p.date).toBe('2026-11-04');
		expect(p.chargeNow).toBe(false);
		expect(p.recommendation!.kw).toBe(11);
		expect(p.recommendation!.start).toBe('2026-11-04T00:00:00.000Z');
		expect(p.basis).toBe('tomorrow');
	});

	it('prices the peak fee per local month on a month-end night', () => {
		// Sat 31 Oct 18:00 local (CET). Weekend + October/November Sunday: low load all night.
		// 31 Oct is pricey so the cheapest candidates sit after local midnight, in November.
		const p = plan({
			nowUtc: '2026-10-31T17:00:00.000Z',
			days: { '2026-10-31': priceDay('2026-10-31', () => 30), '2026-11-01': priceDay('2026-11-01', flat) },
			peaksByMonth: peaksOf([11, 11, 11], '2026-10'), // no November entry
		});
		const r = p.recommendation!;
		const a = p.alternative!;
		// November hours start at 23:00Z; with no November peaks they raise the November fee.
		expect(Date.parse(r.start)).toBeGreaterThanOrEqual(Date.parse('2026-10-31T23:00:00.000Z'));
		expect(r.kw).toBe(3.7);
		expect(r.peakIncrease).toBeCloseTo((11.1 / 3) * perKw, 6);
		expect(a.kw).toBe(11);
		expect(Date.parse(a.start)).toBeGreaterThanOrEqual(Date.parse('2026-10-31T23:00:00.000Z'));
		expect(a.peakIncrease).toBeCloseTo((15 / 3) * perKw, 6);
	});

	it('sums peak increases across both months for a candidate straddling midnight', () => {
		// Only 22:00Z (23:00 local, 31 Oct) and 23:00Z (00:00 local, 1 Nov) are priced: 11 kW must straddle.
		const days = {
			'2026-10-31': { date: '2026-10-31', quarters: priceDay('2026-10-31', flat).quarters.slice(-4) },
			'2026-11-01': { date: '2026-11-01', quarters: priceDay('2026-11-01', flat).quarters.slice(0, 4) },
		};
		const p = plan({
			nowUtc: '2026-10-31T17:00:00.000Z',
			settings: { reducedKw: 11 },
			days,
			peaksByMonth: peaksOf([10, 10, 10], '2026-10'),
		});
		const r = p.recommendation!;
		expect(r.start).toBe('2026-10-31T22:00:00.000Z');
		// October: 11 kWh beats a 10 kW peak (+1 kW); November: 4 kWh into empty peaks (+4 kW).
		expect(r.peakIncrease).toBeCloseTo((1 / 3) * perKw + (4 / 3) * perKw, 6);
	});

	it('handles the DST night (25 Oct, 25-hour day)', () => {
		const days = { '2026-10-24': priceDay('2026-10-24', flat), '2026-10-25': priceDay('2026-10-25', flat) };
		expect(days['2026-10-25'].quarters).toHaveLength(100);
		const p = plan({
			nowUtc: '2026-10-24T16:00:00.000Z',
			batteryPercent: 5,
			days,
		});
		expect(p.chargeNow).toBe(false);
		for (const c of [p.recommendation, p.alternative].filter(Boolean) as PlanCandidate[]) {
			const hours: string[] = [];
			for (let t = Date.parse(c.start); t < Date.parse(c.end); t += HOUR) hours.push(new Date(t).toISOString());
			expect(new Set(hours).size).toBe(hours.length);
			expect(c.start.endsWith(':00:00.000Z')).toBe(true);
			expect(Date.parse(c.end)).toBeLessThanOrEqual(Date.parse('2026-10-25T06:00:00.000Z'));
		}
	});
});
