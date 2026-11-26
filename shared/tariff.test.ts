import { describe, expect, it } from 'vitest';
import { TEST_TARIFF } from './testdata';
import { exVat, inclVat, isHighLoad, isHighLoadHoliday, selectTariff } from './tariff';

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
		['2027-03-30T04:00:00.000Z', true],
		['2027-03-29T04:00:00.000Z', false], // annandag påsk
	])('%s -> %s', (iso, want) => {
		expect(isHighLoad(hl, iso)).toBe(want);
	});
	it('treats the holidays on the invoice as non-weekdays', () => {
		// Thu 24 Dec 2026 and Fri 1 Jan 2027, 10:00 local.
		expect(isHighLoad(hl, '2026-12-24T09:00:00.000Z')).toBe(false);
		expect(isHighLoad(hl, '2027-01-01T09:00:00.000Z')).toBe(false);
		// Mon 28 Dec 2026 is an ordinary weekday.
		expect(isHighLoad(hl, '2026-12-28T09:00:00.000Z')).toBe(true);
		// Easter 2027 is 28 March: skärtorsdag 25 Mar and långfredag 26 Mar are excluded, Wed 24 Mar is not.
		expect(isHighLoad(hl, '2027-03-25T09:00:00.000Z')).toBe(false);
		expect(isHighLoad(hl, '2027-03-26T09:00:00.000Z')).toBe(false);
		expect(isHighLoad(hl, '2027-03-24T09:00:00.000Z')).toBe(true);
	});
	it('knows the Easter-based holidays across years', () => {
		// Easter 2026: 5 Apr; 2028: 16 Apr.
		expect(['2026-04-02', '2026-04-03', '2026-04-06'].every(isHighLoadHoliday)).toBe(true);
		expect(['2028-04-13', '2028-04-14', '2028-04-17'].every(isHighLoadHoliday)).toBe(true);
		expect(isHighLoadHoliday('2026-04-05')).toBe(false);
		expect(isHighLoadHoliday('2026-01-06')).toBe(true);
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
