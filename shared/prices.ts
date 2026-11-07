import { floorHourUtc, localDateOf } from './time';
import type { IsoUtc, PriceDay, PriceQuarter } from './types';

export function parseElpriset(date: string, rows: unknown): PriceDay {
	if (!Array.isArray(rows)) throw new Error('elpriset: expected an array');
	const quarters: PriceQuarter[] = rows.map((r, i) => {
		const row = r as { SEK_per_kWh?: unknown; time_start?: unknown } | null;
		if (!row || typeof row.SEK_per_kWh !== 'number' || typeof row.time_start !== 'string') {
			throw new Error(`elpriset: bad row at index ${i}`);
		}
		return { start: row.time_start, sekPerKwhExVat: row.SEK_per_kWh };
	});
	return { date, quarters };
}

export function spotForHour(days: Record<string, PriceDay>, hourStartUtc: IsoUtc): number | null {
	const day = days[localDateOf(hourStartUtc)];
	if (!day) return null;
	const from = Date.parse(hourStartUtc);
	const to = from + 3_600_000;
	let sum = 0;
	let n = 0;
	for (const q of day.quarters) {
		const t = Date.parse(q.start);
		if (t >= from && t < to) {
			sum += q.sekPerKwhExVat;
			n++;
		}
	}
	return n < 1 ? null : sum / n;
}

export function priceDocDatesFor(hours: IsoUtc[]): string[] {
	return [...new Set(hours.map(h => localDateOf(floorHourUtc(h))))];
}
