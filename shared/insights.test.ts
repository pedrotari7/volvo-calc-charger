import { describe, expect, it } from 'vitest';
import { formatAgo, formatKr, formatKwh } from './format';
import { monthTotals } from './insights';
import { DEFAULT_SETTINGS, type MonthPeaks, type PricedSession } from './types';

const sess = (id: string, startUtc: string, kWh: number, total: number | null): PricedSession => ({
	id,
	startUtc,
	endUtc: startUtc,
	kWh,
	hours: [],
	status: total === null ? 'pending' : 'priced',
	cost: total === null ? null : { spot: 0, markup: 0, transfer: 0, energyTax: 0, vat: 0, total },
	peakShare: 0,
	planned: null,
});

const odo = [
	{ km: 1000, date: '2026-11-01' },
	{ km: 1500, date: '2026-11-20' },
];

describe('monthTotals', () => {
	const s = [sess('a', '2026-11-03T10:00:00Z', 10, 60), sess('b', '2026-11-04T10:00:00Z', 5, 40)];

	it('computes cost, km, kr/100km, petrol and saving', () => {
		const t = monthTotals(s, '2026-11', odo, null, DEFAULT_SETTINGS);
		expect(t).toMatchObject({
			kWh: 15,
			cost: 100,
			avgKrPerKwh: 100 / 15,
			km: 500,
			krPer100km: 20,
			petrolCost: 675,
			saving: 575,
			peakFee: null,
			pendingCount: 0,
		});
	});

	it('adds the peak fee to cost', () => {
		const peaks = { month: '2026-11', top3: [], estimatedFee: 50, final: false } as MonthPeaks;
		const t = monthTotals(s, '2026-11', odo, peaks, DEFAULT_SETTINGS);
		expect(t.cost).toBe(150);
		expect(t.peakFee).toBe(50);
		expect(t.avgKrPerKwh).toBe(10);
	});

	it('returns null km figures with one reading', () => {
		const t = monthTotals(s, '2026-11', [odo[0]!], null, DEFAULT_SETTINGS);
		expect(t.km).toBeNull();
		expect(t.krPer100km).toBeNull();
		expect(t.petrolCost).toBeNull();
		expect(t.saving).toBeNull();
	});

	it('ignores other months, sorts odometer by date and treats delta <= 0 as null', () => {
		const unordered = [odo[1]!, { km: 900, date: '2026-10-30' }, odo[0]!];
		expect(monthTotals(s, '2026-11', unordered, null, DEFAULT_SETTINGS).km).toBe(500);
		const same = [odo[0]!, { km: 1000, date: '2026-11-02' }];
		expect(monthTotals(s, '2026-11', same, null, DEFAULT_SETTINGS).km).toBeNull();
	});

	it('excludes pending from cost, counts them, includes their kWh; other months ignored', () => {
		const all = [...s, sess('p', '2026-11-05T10:00:00Z', 5, null), sess('o', '2026-10-05T10:00:00Z', 99, 99)];
		const t = monthTotals(all, '2026-11', odo, null, DEFAULT_SETTINGS);
		expect(t.cost).toBe(100);
		expect(t.kWh).toBe(20);
		expect(t.pendingCount).toBe(1);
		expect(t.avgKrPerKwh).toBe(100 / 15);
	});

	it('avgKrPerKwh is null when nothing priced', () => {
		const t = monthTotals([sess('p', '2026-11-05T10:00:00Z', 5, null)], '2026-11', [], null, DEFAULT_SETTINGS);
		expect(t.avgKrPerKwh).toBeNull();
	});

	it('assigns by local month of startUtc', () => {
		const edge = [sess('e', '2026-10-31T23:30:00Z', 4, 10)]; // 00:30 local 1 Nov
		expect(monthTotals(edge, '2026-11', [], null, DEFAULT_SETTINGS).kWh).toBe(4);
		expect(monthTotals(edge, '2026-10', [], null, DEFAULT_SETTINGS).kWh).toBe(0);
	});
});

describe('format', () => {
	it('formatKr', () => {
		expect(formatKr(18.6565845)).toBe('18,66 kr');
		expect(formatKr(1234.5)).toBe('1 234,50 kr');
		expect(formatKr(-3)).toBe('-3,00 kr');
	});
	it('formatKwh', () => {
		expect(formatKwh(11.94)).toBe('11,9 kWh');
		expect(formatKwh(1234.56)).toBe('1 234,6 kWh');
	});
	it('formatAgo', () => {
		const now = '2026-11-06T12:00:00Z';
		expect(formatAgo('2026-11-06T11:59:30Z', now)).toBe('just now');
		expect(formatAgo('2026-11-06T11:57:00Z', now)).toBe('3 min ago');
		expect(formatAgo('2026-11-06T10:00:00Z', now)).toBe('2 h ago');
		expect(formatAgo('2026-11-02T12:00:00Z', now)).toBe('4 d ago');
		expect(formatAgo('2026-11-06T12:05:00Z', now)).toBe('just now');
	});
});
