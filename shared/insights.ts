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

	const readings = odometer.filter(o => o.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
	const delta = readings.length >= 2 ? readings[readings.length - 1]!.km - readings[0]!.km : 0;
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
