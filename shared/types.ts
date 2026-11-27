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
	/** The plan this session followed; `kWh` is the energy the plan priced (absent on sessions stored before it was added). */
	planned: (Pick<PlanCandidate, 'kw' | 'start' | 'end' | 'energyCost' | 'cost'> & { kWh?: number }) | null;
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
	battery: Timed<{
		percent: number;
		rangeKm: number | null;
		chargingStatus: string;
		estFullAt: IsoUtc | null;
	}> | null;
	locked: Timed<boolean> | null;
	// keys: door:frontLeft, window:rearLeft, tailgate, hood, sunroof...
	openings: Timed<Record<string, 'open' | 'closed'>> | null;
	tyres: Timed<Record<string, string>> | null;
	warnings: Timed<string[]> | null;
	service: Timed<{ status: string; distanceKm: number | null; days: number | null }> | null;
	odometerKm: Timed<number> | null;
	location: Timed<{ lat: number; lng: number }> | null;
	trips: Timed<Record<string, number>> | null;
	/** Whether the car can take remote commands right now (Volvo's command-accessibility). */
	access?: Timed<{ available: boolean; reason: string | null }> | null;
	updatedAt: IsoUtc;
}

/** Volvo render angles (Home Assistant's names), plus the interior. */
export type CarViewName =
	| 'front_left'
	| 'front'
	| 'front_right'
	| 'side_right'
	| 'back_right'
	| 'back'
	| 'back_left'
	| 'side_left'
	| 'interior';

export interface CarView {
	view: CarViewName;
	url: string;
}

/** car/remote: what the app last asked the car to do, written by the command callable. */
export interface RemoteState {
	last: { command: string; ok: boolean; status: string; at: IsoUtc } | null;
	/** When a remote climate start last succeeded; null after a stop. */
	climateStartedAt: IsoUtc | null;
}

/** What the car is, from Volvo's vehicle details. Changes rarely; refreshed about once a day. */
export interface CarProfile {
	model: string | null;
	modelYear: number | null;
	/** Volvo's paint name, e.g. "Vapour Grey". */
	colour: string | null;
	/** Volvo's render of this exact car (paint, wheels), https only. */
	imageUrl: string | null;
	/** The same render from other angles, and the interior. Some angles may not exist for every car. */
	views?: CarView[];
	/** Command keys the car supports (`LOCK`, `HONK`…) from GET /commands; null when unknown. */
	commands?: string[] | null;
	fetchedAt: IsoUtc;
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

/** Stored settings over the defaults, nested groups included (a partial `petrol` would otherwise yield NaN). */
export function withDefaultSettings(stored: Partial<Settings> | null | undefined): Settings {
	return {
		...DEFAULT_SETTINGS,
		...stored,
		petrol: { ...DEFAULT_SETTINGS.petrol, ...stored?.petrol },
		notifications: { ...DEFAULT_SETTINGS.notifications, ...stored?.notifications },
	};
}
