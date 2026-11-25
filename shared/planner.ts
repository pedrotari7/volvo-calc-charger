import { peakIncrease } from './peaks';
import { hourRateExVat } from './pricing';
import { localDateOf, monthKey, nextLocalTime } from './time';
import type { IsoUtc, MonthPeaks, Plan, PlanCandidate, PriceDay, SessionHour, Settings, Tariff } from './types';

const HOUR_MS = 3_600_000;
const EPS = 1e-9;

export interface PlanInput {
	nowUtc: IsoUtc;
	batteryPercent: number;
	settings: Settings;
	days: Record<string, PriceDay>;
	tariffs: Tariff[];
	peaksByMonth: Record<string, MonthPeaks>;
}

const emptyPeaks = (month: string): MonthPeaks => ({ month, top3: [], estimatedFee: 0, final: false });

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

function candidate(
	kw: number,
	startMs: number,
	kwh: number[],
	input: Pick<PlanInput, 'days' | 'tariffs' | 'peaksByMonth'>
): PlanCandidate | null {
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
	// Each local month has its own peak fee: price every month the candidate touches.
	const byMonth = new Map<string, SessionHour[]>();
	for (const h of hours) {
		const m = monthKey(h.hourStartUtc);
		byMonth.set(m, [...(byMonth.get(m) ?? []), h]);
	}
	let inc = 0;
	for (const [m, hs] of byMonth) inc += peakIncrease(input.peaksByMonth[m] ?? emptyPeaks(m), hs, tariff!);
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

/** kWh the car draws from the wall to go from one battery level to another, to 0.1 kWh. */
export function neededKwhFor(
	fromPercent: number,
	toPercent: number,
	s: Pick<Settings, 'usableBatteryKwh' | 'chargingEfficiency'>
): number {
	const raw = (Math.max(0, toPercent - fromPercent) / 100) * (s.usableBatteryKwh / s.chargingEfficiency);
	return Math.round(raw * 10) / 10;
}

const hoursAt = (neededKwh: number, kw: number) => Math.ceil(neededKwh / kw - EPS);

export interface EstimateInput {
	/** Earliest start; rounded up to a whole hour. */
	startUtc: IsoUtc;
	/** The charge must be finished by this moment. */
	endUtc: IsoUtc;
	neededKwh: number;
	/** Charging powers to try, e.g. [11, 3.7]. */
	kws: number[];
	days: Record<string, PriceDay>;
	tariffs: Tariff[];
	peaksByMonth: Record<string, MonthPeaks>;
}

export interface Estimate {
	/** Cheapest window over every power and start hour. */
	best: PlanCandidate | null;
	/** Cheapest window per power, in `kws` order (powers with no priced window left out). */
	byKw: PlanCandidate[];
	/** Starting at the first hour at the highest power: "just plug in". */
	asap: PlanCandidate | null;
	/** Most expensive start hour at the best window's power. */
	worst: PlanCandidate | null;
	/** Whether the highest power can finish in time at all. */
	fits: boolean;
	/** Hours of the window whose prices are not published yet. */
	missingPrices: boolean;
}

/** Cheapest contiguous charging window inside [startUtc, endUtc] for each power. */
export function estimateCharge(input: EstimateInput): Estimate {
	const start = Math.ceil(Date.parse(input.startUtc) / HOUR_MS) * HOUR_MS;
	const end = Date.parse(input.endUtc);
	const kws = [...new Set(input.kws.filter(kw => kw > 0))];
	const maxKw = Math.max(0, ...kws);
	const out: Estimate = { best: null, byKw: [], asap: null, worst: null, fits: false, missingPrices: false };
	if (input.neededKwh <= 0 || maxKw <= 0) {
		out.fits = true;
		return out;
	}
	out.fits = start + hoursAt(input.neededKwh, maxKw) * HOUR_MS <= end;

	const all = new Map<number, PlanCandidate[]>();
	for (const kw of kws) {
		const n = hoursAt(input.neededKwh, kw);
		const kwh = Array.from({ length: n }, (_, i) => (i < n - 1 ? kw : input.neededKwh - kw * (n - 1)));
		const list: PlanCandidate[] = [];
		for (let t = start; t + n * HOUR_MS <= end; t += HOUR_MS) {
			const c = candidate(kw, t, kwh, input);
			if (c) list.push(c);
			else out.missingPrices = true;
		}
		all.set(kw, list);
		const best = list.reduce<PlanCandidate | null>((b, c) => (better(c, b) ? c : b), null);
		if (best) out.byKw.push(best);
	}
	for (const c of out.byKw) if (better(c, out.best)) out.best = c;
	const atMax = all.get(maxKw) ?? [];
	out.asap = atMax[0] && Date.parse(atMax[0].start) === start ? atMax[0] : null;
	if (out.best) {
		out.worst = (all.get(out.best.kw) ?? []).reduce((w, c) => (c.cost > w.cost + EPS ? c : w), out.best);
	}
	return out;
}

export function planTonight(input: PlanInput): Plan {
	const { nowUtc, batteryPercent, settings: s } = input;
	const endIso = nextLocalTime(nowUtc, s.readyBy);
	const end = Date.parse(endIso);
	const neededKwh = neededKwhFor(batteryPercent, s.targetPercent, s);
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
	const est = estimateCharge({
		startUtc: new Date(start).toISOString(),
		endUtc: endIso,
		neededKwh,
		kws,
		days: input.days,
		tariffs: input.tariffs,
		peaksByMonth: input.peaksByMonth,
	});

	plan.recommendation = est.best;
	if (!plan.recommendation) {
		// Only lack of time means "charge now"; a fitting need with missing prices just has no plan yet.
		plan.chargeNow = start + hoursAt(neededKwh, s.chargerMaxKw) * HOUR_MS > end;
		return plan;
	}
	plan.alternative = est.byKw.find(c => c !== plan.recommendation) ?? null;
	return plan;
}
