import { localParts } from './time';
import type { HighLoad, IsoUtc, Tariff } from './types';

export function selectTariff(tariffs: Tariff[], hourStartUtc: IsoUtc): Tariff | null {
	const date = localParts(hourStartUtc).date;
	let best: Tariff | null = null;
	for (const t of tariffs) {
		if (t.effectiveFrom <= date && (!best || t.effectiveFrom > best.effectiveFrom)) best = t;
	}
	return best;
}

export function isHighLoad(hl: HighLoad, hourStartUtc: IsoUtc): boolean {
	const p = localParts(hourStartUtc);
	if (!hl.months.includes(p.month)) return false;
	if (hl.weekdaysOnly && p.weekday > 5) return false;
	return p.hour >= hl.fromHour && p.hour < hl.toHour;
}

export const exVat = (incl: number, vatRate: number): number => incl / (1 + vatRate);
export const inclVat = (ex: number, vatRate: number): number => ex * (1 + vatRate);
