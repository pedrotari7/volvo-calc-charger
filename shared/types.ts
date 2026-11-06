export type IsoUtc = string; // always ends in 'Z'

export interface PriceQuarter {
	start: string; // keeps source offset
	sekPerKwhExVat: number;
}
export interface PriceDay {
	date: string; // local YYYY-MM-DD
	quarters: PriceQuarter[];
}

export interface HighLoad {
	months: number[];
	weekdaysOnly: boolean;
	fromHour: number;
	toHour: number;
}
export interface Tariff {
	id: string;
	effectiveFrom: string;
	vatRate: number;
	energyTaxPerKwh: number;
	fortum: { markupPerKwh: number; monthlyFee: number };
	nacka: {
		fixedPerYear: number;
		transferLowPerKwh: number;
		transferHighPerKwh: number;
		peakPerKwMonth: number;
		highLoad: HighLoad;
	};
}

export interface SessionHour {
	hourStartUtc: IsoUtc;
	kWh: number;
}
export interface Session {
	id: string;
	startUtc: IsoUtc;
	endUtc: IsoUtc;
	kWh: number;
	hours: SessionHour[];
}
export interface CostBreakdown {
	spot: number;
	markup: number;
	transfer: number;
	energyTax: number;
	vat: number;
	total: number;
}

export interface PlanCandidate {
	kw: number;
	start: IsoUtc;
	end: IsoUtc;
	energyCost: number;
	peakIncrease: number;
	cost: number;
}
export interface Plan {
	date: string;
	batteryPercent: number;
	neededKwh: number;
	basis: 'today' | 'tomorrow';
	chargeNow: boolean;
	recommendation: PlanCandidate | null;
	alternative: PlanCandidate | null;
}
export interface PricedSession extends Session {
	status: 'priced' | 'pending';
	cost: CostBreakdown | null;
	peakShare: number;
	planned: Pick<PlanCandidate, 'kw' | 'start' | 'end' | 'cost'> | null;
}

export interface PeakHour {
	hourStartUtc: IsoUtc;
	kW: number;
	sessionId: string; // session with the largest share of this hour
	parts?: Record<string, number>; // sessionId -> kWh, when several sessions share this clock hour
}
export interface MonthPeaks {
	month: string;
	top3: PeakHour[];
	estimatedFee: number;
	final: boolean;
}

export interface Settings {
	targetPercent: number;
	readyBy: string;
	usableBatteryKwh: number;
	chargingEfficiency: number;
	chargerMaxKw: number;
	reducedKw: number;
	petrol: { litresPer100km: number; krPerLitre: number };
	notifications: { plugIn: boolean; sessionDone: boolean; leftOpen: boolean };
}

export interface ChargerState {
	pluggedIn: boolean;
	charging: boolean;
	liveKw: number;
	sessionKwh: number;
	updatedAt: IsoUtc;
}

export interface Timed<T> {
	value: T;
	at: IsoUtc;
}
export interface CarState {
	vinLast4: string;
	battery: Timed<{ percent: number; rangeKm: number | null; chargingStatus: string; estFullAt: IsoUtc | null }> | null;
	locked: Timed<boolean> | null;
	// keys: door:frontLeft, window:rearLeft, tailgate, hood, sunroof...
	openings: Timed<Record<string, 'open' | 'closed'>> | null;
	tyres: Timed<Record<string, string>> | null;
	warnings: Timed<string[]> | null;
	service: Timed<{ status: string; distanceKm: number | null; days: number | null }> | null;
	odometerKm: Timed<number> | null;
	location: Timed<{ lat: number; lng: number }> | null;
	trips: Timed<Record<string, number>> | null;
	updatedAt: IsoUtc;
}

export const DEFAULT_SETTINGS: Settings = {
	targetPercent: 80,
	readyBy: '07:00',
	usableBatteryKwh: 75,
	chargingEfficiency: 0.9,
	chargerMaxKw: 11,
	reducedKw: 3.7,
	petrol: { litresPer100km: 7.5, krPerLitre: 18 },
	notifications: { plugIn: true, sessionDone: true, leftOpen: true },
};
