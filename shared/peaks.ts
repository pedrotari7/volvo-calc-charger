import { monthKey } from './time';
import type { MonthPeaks, PeakHour, SessionHour, Session, Tariff } from './types';

const EXTRA_ID = '';

function feeFor(kws: number[], tariff: Tariff): number {
	// Always divide by 3: the charger adds 0 kW in peak hours it does not use.
	const sum = kws.reduce((a, b) => a + b, 0);
	return (sum / 3) * tariff.nacka.peakPerKwMonth * (1 + tariff.vatRate);
}

function top3Of(hours: Map<string, Record<string, number>>): PeakHour[] {
	const all = [...hours].map(([hourStartUtc, parts]) => {
		const entries = Object.entries(parts);
		const kW = entries.reduce((a, [, v]) => a + v, 0);
		const sessionId = entries.reduce((best, e) => (e[1] > best[1] ? e : best))[0];
		const ph: PeakHour = { hourStartUtc, kW, sessionId };
		if (entries.length > 1) ph.parts = parts;
		return ph;
	});
	all.sort((a, b) => b.kW - a.kW || Date.parse(a.hourStartUtc) - Date.parse(b.hourStartUtc));
	return all.slice(0, 3);
}

function addTo(hours: Map<string, Record<string, number>>, hour: string, id: string, kWh: number): void {
	const parts = hours.get(hour) ?? {};
	parts[id] = (parts[id] ?? 0) + kWh;
	hours.set(hour, parts);
}

export function computeMonthPeaks(month: string, sessions: Session[], tariff: Tariff): MonthPeaks {
	const hours = new Map<string, Record<string, number>>();
	for (const s of sessions) {
		for (const h of s.hours) {
			if (monthKey(h.hourStartUtc) === month) addTo(hours, h.hourStartUtc, s.id, h.kWh);
		}
	}
	const top3 = top3Of(hours);
	return { month, top3, estimatedFee: feeFor(top3.map((h) => h.kW), tariff), final: false };
}

export function peakShares(peaks: MonthPeaks): Record<string, number> {
	const total = peaks.top3.reduce((a, h) => a + h.kW, 0);
	const out: Record<string, number> = {};
	if (total <= 0) return out;
	for (const h of peaks.top3) {
		const parts = h.parts ?? { [h.sessionId]: h.kW };
		const partTotal = Object.values(parts).reduce((a, b) => a + b, 0);
		for (const [id, v] of Object.entries(parts)) {
			out[id] = (out[id] ?? 0) + (peaks.estimatedFee * h.kW * (v / partTotal)) / total;
		}
	}
	return out;
}

/** Each session's peak-fee share summed over every month given (a session crossing months gets both). */
export function sumPeakShares(months: MonthPeaks[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const m of months) {
		for (const [id, v] of Object.entries(peakShares(m))) out[id] = (out[id] ?? 0) + v;
	}
	return out;
}

/**
 * Fee increase for `peaks.month` if `extraHours` were charged. Extra hours whose local month
 * differs from `peaks.month` are ignored; callers needing another month's increase must call
 * this with that month's MonthPeaks.
 */
export function peakIncrease(peaks: MonthPeaks, extraHours: SessionHour[], tariff: Tariff): number {
	const hours = new Map<string, Record<string, number>>();
	for (const h of peaks.top3) {
		hours.set(h.hourStartUtc, h.parts ? { ...h.parts } : { [h.sessionId]: h.kW });
	}
	for (const e of extraHours) {
		if (monthKey(e.hourStartUtc) !== peaks.month) continue;
		addTo(hours, e.hourStartUtc, EXTRA_ID, e.kWh);
	}
	const fee = feeFor(top3Of(hours).map((h) => h.kW), tariff);
	return Math.max(0, fee - peaks.estimatedFee);
}
