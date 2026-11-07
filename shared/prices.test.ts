import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseElpriset, priceDocDatesFor, spotForHour } from './prices';
import type { PriceDay } from './types';

const load = (f: string): unknown =>
	JSON.parse(readFileSync(new URL(`../backend/test/fixtures/elpriset/${f}`, import.meta.url), 'utf8'));

describe('parseElpriset', () => {
	it('parses 96 quarters keeping source offset', () => {
		const rows = load('2026-11-03_SE3.json') as { SEK_per_kWh: number }[];
		const day = parseElpriset('2026-11-03', rows);
		expect(day.date).toBe('2026-11-03');
		expect(day.quarters).toHaveLength(96);
		expect(day.quarters[0]).toEqual({ start: '2026-11-03T00:00:00+01:00', sekPerKwhExVat: rows[0].SEK_per_kWh });
	});
	it('throws on non-array and malformed rows', () => {
		expect(() => parseElpriset('2026-11-03', {})).toThrow();
		expect(() => parseElpriset('2026-11-03', [{ time_start: 'x' }])).toThrow();
		expect(() => parseElpriset('2026-11-03', [{ SEK_per_kWh: 1 }])).toThrow();
		expect(() => parseElpriset('2026-11-03', [null])).toThrow();
	});
});

describe('spotForHour', () => {
	const q = (start: string, v: number) => ({ start, sekPerKwhExVat: v });
	it('averages quarters in the hour', () => {
		const days: Record<string, PriceDay> = {
			'2026-11-03': {
				date: '2026-11-03',
				quarters: ['00:00', '00:15', '00:30', '00:45'].map(t => q(`2026-11-03T${t}:00+01:00`, 0.8)),
			},
		};
		expect(spotForHour(days, '2026-11-02T23:00:00.000Z')).toBeCloseTo(0.8, 10);
		expect(spotForHour({}, '2026-11-02T23:00:00.000Z')).toBeNull();
		expect(spotForHour(days, '2026-11-03T05:00:00.000Z')).toBeNull();
	});
	it('distinguishes the two 02:00 hours on a DST day', () => {
		const rows = load('2026-10-25_SE3.json');
		const day = parseElpriset('2026-10-25', rows);
		expect(day.quarters).toHaveLength(100);
		const days = { '2026-10-25': day };
		const a = spotForHour(days, '2026-10-25T00:00:00.000Z');
		const b = spotForHour(days, '2026-10-25T01:00:00.000Z');
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(a).not.toBe(b);
	});
});

describe('priceDocDatesFor', () => {
	it('returns distinct local dates', () => {
		expect(
			priceDocDatesFor(['2026-11-02T22:00:00.000Z', '2026-11-02T23:00:00.000Z', '2026-11-03T00:00:00.000Z'])
		).toEqual(['2026-11-02', '2026-11-03']);
	});
});
