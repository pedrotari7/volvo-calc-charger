import { describe, expect, it } from 'vitest';
import { TEST_TARIFF } from './testdata';
import { exVat, inclVat, isHighLoad, selectTariff } from './tariff';

describe('selectTariff', () => {
	const t1 = TEST_TARIFF;
	const t2 = { ...TEST_TARIFF, id: 't2', effectiveFrom: '2026-07-01' };
	it('picks the latest effective tariff by local date', () => {
		expect(selectTariff([t2, t1], '2026-06-15T10:00:00.000Z')?.id).toBe('t1');
		expect(selectTariff([t1, t2], '2026-06-30T22:30:00.000Z')?.id).toBe('t2');
		expect(selectTariff([t1, t2], '2025-12-31T12:00:00.000Z')).toBeNull();
	});
});

describe('isHighLoad', () => {
	const hl = TEST_TARIFF.nacka.highLoad;
	it.each([
		['2026-11-03T05:00:00.000Z', true],
		['2026-11-03T04:00:00.000Z', false],
		['2026-11-03T21:00:00.000Z', false],
		['2026-11-07T10:00:00.000Z', false],
		['2026-07-01T10:00:00.000Z', false],
		['2027-03-29T04:00:00.000Z', true],
	])('%s -> %s', (iso, want) => {
		expect(isHighLoad(hl, iso)).toBe(want);
	});
	it('applies on weekends when weekdaysOnly is false', () => {
		expect(isHighLoad({ ...hl, weekdaysOnly: false }, '2026-11-07T10:00:00.000Z')).toBe(true);
	});
});

describe('vat', () => {
	it('converts both ways', () => {
		expect(exVat(0.092, 0.25)).toBeCloseTo(0.0736, 10);
		expect(inclVat(45.216, 0.25)).toBeCloseTo(56.52, 10);
	});
});
