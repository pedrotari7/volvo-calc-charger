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
const noPeaks: MonthPeaks = { month: '2026-11', top3: [], estimatedFee: 0, final: false };
const peaksOf = (kws: number[]): MonthPeaks => {
	const s: Session = {
		id: 'old',
		startUtc: '2026-11-01T00:00:00.000Z',
		endUtc: '2026-11-01T03:00:00.000Z',
		kWh: kws.reduce((a, b) => a + b, 0),
		hours: kws.map((kWh, i) => ({
			hourStartUtc: new Date(Date.parse('2026-11-01T00:00:00.000Z') + i * HOUR).toISOString(),
			kWh,
		})),
	};
	return computeMonthPeaks('2026-11', [s], TEST_TARIFF);
};

const NOW = '2026-11-03T17:00:00.000Z'; // 18:00 local, Tuesday
const plan = (o: {
	nowUtc?: string;
	batteryPercent?: number;
	settings?: Partial<Settings>;
	days?: Record<string, PriceDay>;
	peaks?: MonthPeaks;
}) =>
	planTonight({
		nowUtc: o.nowUtc ?? NOW,
		batteryPercent: o.batteryPercent ?? 62,
		settings: { ...DEFAULT_SETTINGS, ...o.settings },
		days: o.days ?? flatDays(),
		tariffs: [TEST_TARIFF],
		peaks: o.peaks ?? noPeaks,
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
		expect(r.peakIncrease).toBeCloseTo((11.1 / 3) * 45.216 * 1.25, 6);
		expect(r.start).toBe('2026-11-03T21:00:00.000Z');
	});

	it('flat price, peaks [10,10,10]: 11 kW would raise the peak, so reduced kW wins', () => {
		// Brief expected kw 11 here, but an 11 kWh hour beats a 10 kW peak: +1/3 kW × 45.216 × 1.25.
		// The tie case the brief describes is pinned with peaks [11,11,11] below.
		const p = plan({ peaks: peaksOf([10, 10, 10]) });
		expect(p.recommendation!.kw).toBe(3.7);
		expect(p.recommendation!.peakIncrease).toBe(0);
		expect(p.alternative!.kw).toBe(11);
		expect(p.alternative!.start).toBe('2026-11-03T21:00:00.000Z');
		expect(p.alternative!.peakIncrease).toBeCloseTo((1 / 3) * 45.216 * 1.25, 6);
	});

	it('flat price, peaks [11,11,11]: tie on cost goes to higher kW, first low-load start', () => {
		const p = plan({ peaks: peaksOf([11, 11, 11]) });
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
			peaks: peaksOf([11, 11, 11]),
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

	it('charges now when no prices are known at all', () => {
		const p = plan({ days: {} });
		expect(p.chargeNow).toBe(true);
		expect(p.basis).toBe('today');
		expect(p.recommendation).toBeNull();
	});

	it('starts at the next whole hour when now is past 18:00', () => {
		const p = plan({ nowUtc: '2026-11-03T20:30:00.000Z', peaks: peaksOf([11, 11, 11]) });
		const r = p.recommendation!;
		expect(Date.parse(r.start)).toBeGreaterThanOrEqual(Date.parse('2026-11-03T21:00:00.000Z'));
		expect(r.start).toBe('2026-11-03T21:00:00.000Z');
	});

	it('starts at 18:00 local when called during the day', () => {
		const p = plan({
			nowUtc: '2026-11-03T09:12:00.000Z',
			batteryPercent: 5,
			settings: { chargerMaxKw: 11, reducedKw: 11 },
		});
		// 62.5 kWh at 11 kW = 6 hours; window 17:00Z-06:00Z
		expect(p.chargeNow).toBe(false);
		expect(Date.parse(p.recommendation!.start)).toBeGreaterThanOrEqual(Date.parse('2026-11-03T17:00:00.000Z'));
		expect(p.date).toBe('2026-11-03');
	});

	it('starts now when called after midnight, before readyBy', () => {
		const p = plan({ nowUtc: '2026-11-04T00:00:00.000Z', peaks: peaksOf([11, 11, 11]) });
		expect(p.date).toBe('2026-11-04');
		expect(p.chargeNow).toBe(false);
		expect(p.recommendation!.kw).toBe(11);
		expect(p.recommendation!.start).toBe('2026-11-04T00:00:00.000Z');
		expect(p.basis).toBe('tomorrow');
	});

	it('handles the DST night (25 Oct, 25-hour day)', () => {
		const days = { '2026-10-24': priceDay('2026-10-24', flat), '2026-10-25': priceDay('2026-10-25', flat) };
		expect(days['2026-10-25'].quarters).toHaveLength(100);
		const p = plan({
			nowUtc: '2026-10-24T16:00:00.000Z',
			batteryPercent: 5,
			days,
			peaks: { month: '2026-10', top3: [], estimatedFee: 0, final: false },
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
