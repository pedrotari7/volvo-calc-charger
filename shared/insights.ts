import { monthKey } from './time';
import type { MonthPeaks, PricedSession, Settings } from './types';

export interface MonthTotals {
	kWh: number;
	cost: number;
	avgKrPerKwh: number | null;
	km: number | null;
	krPer100km: number | null;
	petrolCost: number | null;
	saving: number | null;
	peakFee: number | null;
	pendingCount: number;
}

const BASELINE_DAYS = 7;

/**
 * Km driven in `month`: the month's last reading minus the last reading before the month (each date's doc
 * holds that day's final reading, so the month's own first reading would miss the first day's driving).
 * A baseline older than a week is ignored (a long gap in readings), falling back to the month's first reading.
 */
function odometerDelta(odometer: { km: number; date: string }[], month: string): number {
	const sorted = [...odometer].sort((a, b) => a.date.localeCompare(b.date));
	const inMonth = sorted.filter(o => o.date.startsWith(month));
	if (inMonth.length === 0) return 0;
	const [y, m] = month.split('-').map(Number) as [number, number];
	const earliest = new Date(Date.UTC(y, m - 1, 1 - BASELINE_DAYS)).toISOString().slice(0, 10);
	const before = sorted.filter(o => o.date < `${month}-01` && o.date >= earliest).pop();
	const from = before ?? (inMonth.length >= 2 ? inMonth[0]! : null);
	return from ? inMonth[inMonth.length - 1]!.km - from.km : 0;
}

export function monthTotals(
	sessions: PricedSession[],
	month: string,
	odometer: { km: number; date: string }[],
	peaks: MonthPeaks | null,
	settings: Settings
): MonthTotals {
	const inMonth = sessions.filter(s => monthKey(s.startUtc) === month);
	const priced = inMonth.filter(s => s.status === 'priced' && s.cost);
	const peakFee = peaks?.estimatedFee ?? null;
	const cost = priced.reduce((a, s) => a + (s.cost?.total ?? 0), 0) + (peakFee ?? 0);
	const pricedKwh = priced.reduce((a, s) => a + s.kWh, 0);

	const delta = odometerDelta(odometer, month);
	const km = delta > 0 ? delta : null;
	const petrolCost = km === null ? null : (km / 100) * settings.petrol.litresPer100km * settings.petrol.krPerLitre;

	return {
		kWh: inMonth.reduce((a, s) => a + s.kWh, 0),
		cost,
		avgKrPerKwh: pricedKwh > 0 ? cost / pricedKwh : null,
		km,
		krPer100km: km === null ? null : (cost / km) * 100,
		petrolCost,
		saving: petrolCost === null ? null : petrolCost - cost,
		peakFee,
		pendingCount: inMonth.length - priced.length,
	};
}
