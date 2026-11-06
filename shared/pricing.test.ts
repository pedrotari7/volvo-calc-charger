import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allInRateInclVat, hourRateExVat, priceSession } from './pricing';
import { TEST_TARIFF } from './testdata';
import type { PriceDay, Session, Tariff } from './types';
import { parseZaptecSessions } from './zaptec';

const fixture = (): unknown =>
	JSON.parse(readFileSync(new URL('../backend/test/fixtures/zaptec/chargehistory.json', import.meta.url), 'utf8'));

const quarters = (date: string, hour: number, prices: number[]) =>
	prices.map((p, i) => ({
		start: `${date}T${String(hour).padStart(2, '0')}:${String(i * 15).padStart(2, '0')}:00+01:00`,
		sekPerKwhExVat: p,
	}));

const day3: PriceDay = {
	date: '2026-11-03',
	quarters: [...quarters('2026-11-03', 0, [0.8, 0.8, 0.8, 0.8]), ...quarters('2026-11-03', 1, [0.6, 0.62, 0.58, 0.6])],
};
const days = { '2026-11-03': day3 };
const tariffs = [TEST_TARIFF];

describe('priceSession', () => {
	it('prices the real 2-3 Nov session', () => {
		const s = parseZaptecSessions(fixture())[0]!;
		const r = priceSession(s, days, tariffs);
		expect(r.status).toBe('priced');
		const c = r.cost!;
		expect(c.spot).toBeCloseTo(9.1506, 4);
		expect(c.markup).toBeCloseTo(0.59705, 4);
		expect(c.transfer).toBeCloseTo(0.8788576, 4);
		expect(c.energyTax).toBeCloseTo(4.29876, 4);
		expect(c.vat).toBeCloseTo(3.7313169, 4);
		expect(c.total).toBeCloseTo(18.6565845, 4);
	});

	it('is pending when a price day is missing', () => {
		const s = parseZaptecSessions(fixture())[0]!;
		expect(priceSession(s, {}, tariffs)).toEqual({ status: 'pending', cost: null });
	});

	it('uses the high transfer rate at 07 local on a weekday in November', () => {
		const d: PriceDay = { date: '2026-11-03', quarters: quarters('2026-11-03', 7, [1, 1, 1, 1]) };
		const r = hourRateExVat('2026-11-03T06:00:00.000Z', { '2026-11-03': d }, tariffs)!;
		expect(r.transfer).toBe(0.2944);
		const s: Session = {
			id: 'x',
			startUtc: '2026-11-03T06:00:00.000Z',
			endUtc: '2026-11-03T07:00:00.000Z',
			kWh: 2,
			hours: [{ hourStartUtc: '2026-11-03T06:00:00.000Z', kWh: 2 }],
		};
		expect(priceSession(s, { '2026-11-03': d }, tariffs).cost!.transfer).toBeCloseTo(0.5888, 6);
	});

	it('uses each hour\'s own tariff across a tariff boundary', () => {
		const t2: Tariff = { ...TEST_TARIFF, id: 't2', effectiveFrom: '2026-07-01', vatRate: 0.5, energyTaxPerKwh: 1 };
		const jun: PriceDay = {
			date: '2026-06-30',
			quarters: ['21:00', '21:15', '21:30', '21:45'].map((t) => ({ start: `2026-06-30T${t}:00+02:00`, sekPerKwhExVat: 1 })),
		};
		const jul: PriceDay = {
			date: '2026-07-01',
			quarters: ['00:00', '00:15', '00:30', '00:45'].map((t) => ({ start: `2026-07-01T${t}:00+02:00`, sekPerKwhExVat: 1 })),
		};
		const s: Session = {
			id: 'x',
			startUtc: '2026-06-30T19:00:00.000Z',
			endUtc: '2026-06-30T23:00:00.000Z',
			kWh: 2,
			hours: [
				{ hourStartUtc: '2026-06-30T19:00:00.000Z', kWh: 1 },
				{ hourStartUtc: '2026-06-30T22:00:00.000Z', kWh: 1 },
			],
		};
		const r = priceSession(s, { '2026-06-30': jun, '2026-07-01': jul }, [TEST_TARIFF, t2]);
		expect(r.status).toBe('priced');
		expect(r.cost!.energyTax).toBeCloseTo(0.36 + 1, 6);
		const ex1 = 1 + 0.05 + 0.0736 + 0.36;
		const ex2 = 1 + 0.05 + 0.0736 + 1;
		expect(r.cost!.vat).toBeCloseTo(ex1 * 0.25 + ex2 * 0.5, 6);
	});
});

describe('allInRateInclVat', () => {
	it('returns the incl-VAT rate or null', () => {
		const h = '2026-11-03T00:00:00.000Z';
		expect(allInRateInclVat(h, days, tariffs)).toBeCloseTo((0.6 + 0.05 + 0.0736 + 0.36) * 1.25, 6);
		expect(allInRateInclVat(h, {}, tariffs)).toBeNull();
	});
});
