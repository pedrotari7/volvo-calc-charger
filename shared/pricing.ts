import { spotForHour } from './prices';
import { localDateOf } from './time';
import { inclVat, isHighLoad, selectTariff } from './tariff';
import type { CostBreakdown, IsoUtc, PriceDay, Session, Tariff } from './types';

export interface HourRate {
	spot: number;
	markup: number;
	transfer: number;
	energyTax: number;
	tariff: Tariff;
}

export function hourRateExVat(
	hourStartUtc: IsoUtc,
	days: Record<string, PriceDay>,
	tariffs: Tariff[]
): HourRate | null {
	const spot = spotForHour(days, hourStartUtc);
	const tariff = selectTariff(tariffs, hourStartUtc);
	if (spot === null || !tariff) return null;
	const n = tariff.nacka;
	return {
		spot,
		markup: tariff.fortum.markupPerKwh,
		transfer: isHighLoad(n.highLoad, hourStartUtc) ? n.transferHighPerKwh : n.transferLowPerKwh,
		energyTax: tariff.energyTaxPerKwh,
		tariff,
	};
}

export function priceSession(
	s: Session,
	days: Record<string, PriceDay>,
	tariffs: Tariff[]
): { status: 'priced' | 'pending'; cost: CostBreakdown | null } {
	let spot = 0;
	let markup = 0;
	let transfer = 0;
	let energyTax = 0;
	let vat = 0;
	for (const h of s.hours) {
		const r = hourRateExVat(h.hourStartUtc, days, tariffs);
		if (!r) return { status: 'pending', cost: null };
		const sp = r.spot * h.kWh;
		const mk = r.markup * h.kWh;
		const tr = r.transfer * h.kWh;
		const et = r.energyTax * h.kWh;
		spot += sp;
		markup += mk;
		transfer += tr;
		energyTax += et;
		vat += (sp + mk + tr + et) * r.tariff.vatRate;
	}
	return {
		status: 'priced',
		cost: { spot, markup, transfer, energyTax, vat, total: spot + markup + transfer + energyTax + vat },
	};
}

export function allInRateInclVat(
	hourStartUtc: IsoUtc,
	days: Record<string, PriceDay>,
	tariffs: Tariff[]
): number | null {
	const r = hourRateExVat(hourStartUtc, days, tariffs);
	return r ? inclVat(r.spot + r.markup + r.transfer + r.energyTax, r.tariff.vatRate) : null;
}

export interface QuarterRate {
	start: IsoUtc;
	rate: number;
}

// All-in incl-VAT rate for each published quarter of an hour (spot per quarter, tariff parts per hour).
export function quarterRatesInclVat(
	hourStartUtc: IsoUtc,
	days: Record<string, PriceDay>,
	tariffs: Tariff[]
): QuarterRate[] {
	const r = hourRateExVat(hourStartUtc, days, tariffs);
	const day = days[localDateOf(hourStartUtc)];
	if (!r || !day) return [];
	const from = Date.parse(hourStartUtc);
	const fixed = r.markup + r.transfer + r.energyTax;
	return day.quarters
		.map(q => ({ t: Date.parse(q.start), spot: q.sekPerKwhExVat }))
		.filter(q => q.t >= from && q.t < from + 3_600_000)
		.sort((a, b) => a.t - b.t)
		.map(q => ({ start: new Date(q.t).toISOString(), rate: inclVat(q.spot + fixed, r.tariff.vatRate) }));
}
