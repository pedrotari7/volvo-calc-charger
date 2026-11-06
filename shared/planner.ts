import { peakIncrease } from './peaks';
import { hourRateExVat } from './pricing';
import { localDateOf, nextLocalTime } from './time';
import type { IsoUtc, MonthPeaks, Plan, PlanCandidate, PriceDay, SessionHour, Settings, Tariff } from './types';

const HOUR_MS = 3_600_000;
const EPS = 1e-9;

export interface PlanInput {
	nowUtc: IsoUtc;
	batteryPercent: number;
	settings: Settings;
	days: Record<string, PriceDay>;
	tariffs: Tariff[];
	peaks: MonthPeaks;
}

/** Window start: max(now, 18:00 local today), rounded up to a whole UTC hour; `now` if 18:00 today is past readyBy. */
function windowStart(nowUtc: IsoUtc, endMs: number): number {
	const now = Date.parse(nowUtc);
	const six = nextLocalTime(nowUtc, '18:00');
	// nextLocalTime is strictly after now: a different local date means 18:00 today has passed.
	let start = localDateOf(six) === localDateOf(nowUtc) ? Date.parse(six) : now;
	// After midnight, before readyBy: 18:00 today lies beyond the window, so charge from now.
	if (start >= endMs) start = now;
	return Math.ceil(start / HOUR_MS) * HOUR_MS;
}

function candidate(kw: number, startMs: number, kwh: number[], input: PlanInput): PlanCandidate | null {
	const hours: SessionHour[] = [];
	let energyCost = 0;
	let tariff: Tariff | null = null;
	for (let i = 0; i < kwh.length; i++) {
		const hourStartUtc = new Date(startMs + i * HOUR_MS).toISOString();
		const r = hourRateExVat(hourStartUtc, input.days, input.tariffs);
		if (!r) return null;
		tariff ??= r.tariff;
		energyCost += kwh[i]! * (r.spot + r.markup + r.transfer + r.energyTax) * (1 + r.tariff.vatRate);
		hours.push({ hourStartUtc, kWh: kwh[i]! });
	}
	const inc = peakIncrease(input.peaks, hours, tariff!);
	return {
		kw,
		start: new Date(startMs).toISOString(),
		end: new Date(startMs + kwh.length * HOUR_MS).toISOString(),
		energyCost,
		peakIncrease: inc,
		cost: energyCost + inc,
	};
}

function better(a: PlanCandidate, b: PlanCandidate | null): boolean {
	if (!b) return true;
	if (Math.abs(a.cost - b.cost) > EPS) return a.cost < b.cost;
	if (a.kw !== b.kw) return a.kw > b.kw;
	return Date.parse(a.start) < Date.parse(b.start);
}

export function planTonight(input: PlanInput): Plan {
	const { nowUtc, batteryPercent, settings: s } = input;
	const endIso = nextLocalTime(nowUtc, s.readyBy);
	const end = Date.parse(endIso);
	const raw = (Math.max(0, s.targetPercent - batteryPercent) / 100) * (s.usableBatteryKwh / s.chargingEfficiency);
	const neededKwh = Math.round(raw * 10) / 10;
	const plan: Plan = {
		date: localDateOf(nowUtc),
		batteryPercent,
		neededKwh,
		basis: input.days[localDateOf(endIso)] ? 'tomorrow' : 'today',
		chargeNow: false,
		recommendation: null,
		alternative: null,
	};
	if (neededKwh <= 0) return plan;

	const start = windowStart(nowUtc, end);
	const kws = s.reducedKw < s.chargerMaxKw ? [s.chargerMaxKw, s.reducedKw] : [s.chargerMaxKw];
	const best = new Map<number, PlanCandidate>();
	for (const kw of kws) {
		const n = Math.ceil(neededKwh / kw - EPS);
		const kwh = Array.from({ length: n }, (_, i) => (i < n - 1 ? kw : neededKwh - kw * (n - 1)));
		for (let t = start; t + n * HOUR_MS <= end; t += HOUR_MS) {
			const c = candidate(kw, t, kwh, input);
			if (c && better(c, best.get(kw) ?? null)) best.set(kw, c);
		}
	}

	for (const c of best.values()) if (better(c, plan.recommendation)) plan.recommendation = c;
	if (!plan.recommendation) {
		plan.chargeNow = true;
		return plan;
	}
	plan.alternative = [...best.values()].find(c => c !== plan.recommendation) ?? null;
	return plan;
}
