import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeMonthPeaks, peakIncrease, peakShares } from './peaks';
import { TEST_TARIFF } from './testdata';
import type { Session } from './types';
import { parseZaptecSessions } from './zaptec';

const fixture = (): unknown =>
	JSON.parse(readFileSync(new URL('../backend/test/fixtures/zaptec/chargehistory.json', import.meta.url), 'utf8'));

const perKw = 45.216 * 1.25;
const session = (id: string, hours: [string, number][]): Session => ({
	id,
	startUtc: hours[0]![0],
	endUtc: hours[hours.length - 1]![0],
	kWh: hours.reduce((a, h) => a + h[1], 0),
	hours: hours.map(([hourStartUtc, kWh]) => ({ hourStartUtc, kWh })),
});

describe('computeMonthPeaks', () => {
	it('uses the 2-3 Nov session', () => {
		const s = parseZaptecSessions(fixture())[0]!;
		const p = computeMonthPeaks('2026-11', [s], TEST_TARIFF);
		expect(p.top3.map((h) => h.kW)).toEqual([9.93, 2.011]);
		expect(p.estimatedFee).toBeCloseTo((11.941 / 3) * perKw, 4);
		expect(p.estimatedFee).toBeCloseTo(224.9684, 3);
		expect(p.final).toBe(false);
		expect(peakShares(p)[s.id]).toBeCloseTo(p.estimatedFee, 6);
	});

	it('takes the top three across sessions and splits shares', () => {
		const A = session('A', [['2026-11-02T10:00:00.000Z', 10], ['2026-11-02T11:00:00.000Z', 4]]);
		const B = session('B', [['2026-11-03T10:00:00.000Z', 8], ['2026-11-03T11:00:00.000Z', 9]]);
		const p = computeMonthPeaks('2026-11', [A, B], TEST_TARIFF);
		expect(p.top3.map((h) => h.kW)).toEqual([10, 9, 8]);
		const sh = peakShares(p);
		expect(sh.A).toBeCloseTo((p.estimatedFee * 10) / 27, 6);
		expect(sh.B).toBeCloseTo((p.estimatedFee * 17) / 27, 6);
	});

	it('breaks ties by earlier hour', () => {
		const A = session('A', [['2026-11-05T10:00:00.000Z', 5]]);
		const B = session('B', [['2026-11-02T10:00:00.000Z', 5]]);
		expect(computeMonthPeaks('2026-11', [A, B], TEST_TARIFF).top3[0]!.sessionId).toBe('B');
	});

	it('counts a local-November hour that is 31 Oct UTC', () => {
		const s = session('S', [['2026-10-31T23:00:00.000Z', 6]]);
		expect(computeMonthPeaks('2026-11', [s], TEST_TARIFF).top3.map((h) => h.kW)).toEqual([6]);
		expect(computeMonthPeaks('2026-10', [s], TEST_TARIFF).top3).toEqual([]);
	});

	it('only counts hours inside the month for a straddling session', () => {
		const s = session('S', [['2026-10-31T22:00:00.000Z', 7], ['2026-10-31T23:00:00.000Z', 3]]);
		expect(computeMonthPeaks('2026-10', [s], TEST_TARIFF).top3.map((h) => h.kW)).toEqual([7]);
	});

	it('sums back-to-back sessions in the same hour and splits by kWh', () => {
		const A = session('A', [['2026-11-02T10:00:00.000Z', 6]]);
		const B = session('B', [['2026-11-02T10:00:00.000Z', 4]]);
		const p = computeMonthPeaks('2026-11', [A, B], TEST_TARIFF);
		expect(p.top3.map((h) => h.kW)).toEqual([10]);
		const sh = peakShares(p);
		expect(sh.A).toBeCloseTo(p.estimatedFee * 0.6, 6);
		expect(sh.B).toBeCloseTo(p.estimatedFee * 0.4, 6);
	});
});

describe('peakIncrease', () => {
	const hr = (h: number, kWh: number) => ({ hourStartUtc: `2026-11-20T${String(h).padStart(2, '0')}:00:00.000Z`, kWh });
	it('is 0 when extra hours are below the current top 3', () => {
		const s = session('S', [['2026-11-02T10:00:00.000Z', 10], ['2026-11-02T11:00:00.000Z', 10], ['2026-11-02T12:00:00.000Z', 10]]);
		const p = computeMonthPeaks('2026-11', [s], TEST_TARIFF);
		expect(peakIncrease(p, [hr(1, 3.7), hr(2, 3.7)], TEST_TARIFF)).toBe(0);
	});
	it('prices an empty month', () => {
		const p = computeMonthPeaks('2026-11', [], TEST_TARIFF);
		expect(p.estimatedFee).toBe(0);
		expect(peakIncrease(p, [hr(1, 11), hr(2, 4)], TEST_TARIFF)).toBeCloseTo(282.6, 6);
	});
	it('adds to a coinciding top hour', () => {
		const s = session('S', [['2026-11-20T01:00:00.000Z', 5]]);
		const p = computeMonthPeaks('2026-11', [s], TEST_TARIFF);
		expect(peakIncrease(p, [hr(1, 3)], TEST_TARIFF)).toBeCloseTo((3 / 3) * perKw, 6);
	});
});
