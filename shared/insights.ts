import { monthKey } from './time';
import type { MonthPeaks, PricedSession, Settings } from './types';

export interface MonthTotals {
	kWh: number;
	/** Priced sessions' energy cost plus the month's peak fee. */
	cost: number;
	/** Priced sessions' energy cost alone. */
	energyCost: number;
	/** Energy cost per priced kWh, without the peak fee. */
	energyKrPerKwh: number | null;
	avgKrPerKwh: number | null;
	km: number | null;
	/** `km` comes from the energy charged and the car's average consumption, not the odometer. */
	kmEstimated: boolean;
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
function odometerDelta(odometer: { km: number; date: string }[], month: string): { km: number; whole: boolean } {
	const sorted = [...odometer].sort((a, b) => a.date.localeCompare(b.date));
	const inMonth = sorted.filter(o => o.date.startsWith(month));
	if (inMonth.length === 0) return { km: 0, whole: false };
	const [y, m] = month.split('-').map(Number) as [number, number];
	const earliest = new Date(Date.UTC(y, m - 1, 1 - BASELINE_DAYS)).toISOString().slice(0, 10);
	const before = sorted.filter(o => o.date < `${month}-01` && o.date >= earliest).pop();
	const from = before ?? (inMonth.length >= 2 ? inMonth[0]! : null);
	return { km: from ? inMonth[inMonth.length - 1]!.km - from.km : 0, whole: before !== undefined };
}

export function monthTotals(
	sessions: PricedSession[],
	month: string,
	odometer: { km: number; date: string }[],
	peaks: MonthPeaks | null,
	settings: Settings,
	/** The car's long-run average, kWh per 100 km; estimates km when the odometer doesn't span the month. */
	consumptionKwhPer100km: number | null = null
): MonthTotals {
	const inMonth = sessions.filter(s => monthKey(s.startUtc) === month);
	const priced = inMonth.filter(s => s.status === 'priced' && s.cost);
	const peakFee = peaks?.estimatedFee ?? null;
	const energyCost = priced.reduce((a, s) => a + (s.cost?.total ?? 0), 0);
	const cost = energyCost + (peakFee ?? 0);
	const pricedKwh = priced.reduce((a, s) => a + s.kWh, 0);

	// Odometer km set against the whole month's cost only when a reading before the month anchors it;
	// otherwise the km the priced energy covers, so km and cost describe the same charging.
	const delta = odometerDelta(odometer, month);
	const estimate =
		consumptionKwhPer100km && consumptionKwhPer100km > 0 && pricedKwh > 0
			? ((pricedKwh * settings.chargingEfficiency) / consumptionKwhPer100km) * 100
			: null;
	const kmEstimated = !delta.whole && estimate !== null;
	const km = kmEstimated ? estimate : delta.km > 0 ? delta.km : null;
	const petrolCost = km === null ? null : (km / 100) * settings.petrol.litresPer100km * settings.petrol.krPerLitre;

	return {
		kWh: inMonth.reduce((a, s) => a + s.kWh, 0),
		cost,
		energyCost,
		energyKrPerKwh: pricedKwh > 0 ? energyCost / pricedKwh : null,
		avgKrPerKwh: pricedKwh > 0 ? cost / pricedKwh : null,
		km,
		kmEstimated,
		krPer100km: km === null ? null : (cost / km) * 100,
		petrolCost,
		saving: petrolCost === null ? null : petrolCost - cost,
		peakFee,
		pendingCount: inMonth.length - priced.length,
	};
}
