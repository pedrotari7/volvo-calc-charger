import type { CarState, IsoUtc, Timed } from './types';

type Obj = Record<string, unknown>;
interface Entry {
	value: unknown;
	ts: number | null;
}

function isObj(x: unknown): x is Obj {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function entry(x: unknown): Entry | null {
	if (!isObj(x) || !('value' in x)) return null;
	const raw = x.timestamp ?? x.updatedAt;
	const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
	return { value: x.value, ts: Number.isNaN(t) ? null : t };
}

function dataOf(section: unknown): Obj | null {
	return isObj(section) && isObj(section.data) ? section.data : null;
}

/** Wrap a value with the newest timestamp among the entries used. */
function timed<T>(value: T, used: Array<Entry | null>, now: IsoUtc): Timed<T> {
	let max: number | null = null;
	for (const e of used) if (e?.ts != null && (max === null || e.ts > max)) max = e.ts;
	return { value, at: max === null ? now : (new Date(max).toISOString() as IsoUtc) };
}

function guard<T>(fn: () => T | null): T | null {
	try {
		return fn();
	} catch {
		return null;
	}
}

function openState(v: unknown): 'open' | 'closed' | null {
	if (v === 'OPEN' || v === 'AJAR') return 'open';
	if (v === 'CLOSED') return 'closed';
	return null;
}

const DOOR_KEYS: Array<[string, string]> = [
	['frontLeftDoor', 'door:frontLeft'],
	['frontRightDoor', 'door:frontRight'],
	['rearLeftDoor', 'door:rearLeft'],
	['rearRightDoor', 'door:rearRight'],
	['tailgate', 'tailgate'],
	['hood', 'hood'],
];
const WINDOW_KEYS: Array<[string, string]> = [
	['frontLeftWindow', 'window:frontLeft'],
	['frontRightWindow', 'window:frontRight'],
	['rearLeftWindow', 'window:rearLeft'],
	['rearRightWindow', 'window:rearRight'],
	['sunroof', 'sunroof'],
];

function parseOpenings(doors: unknown, windows: unknown, now: IsoUtc): CarState['openings'] {
	const out: Record<string, 'open' | 'closed'> = {};
	const used: Entry[] = [];
	for (const [data, keys] of [
		[dataOf(doors), DOOR_KEYS],
		[dataOf(windows), WINDOW_KEYS],
	] as const) {
		if (!data) continue;
		for (const [src, key] of keys) {
			const e = entry(data[src]);
			const s = e ? openState(e.value) : null;
			if (e && s) {
				out[key] = s;
				used.push(e);
			}
		}
	}
	return used.length ? timed(out, used, now) : null;
}

function parseLocked(doors: unknown, now: IsoUtc): CarState['locked'] {
	const e = entry(dataOf(doors)?.centralLock);
	if (!e) return null;
	if (e.value === 'LOCKED') return timed(true, [e], now);
	if (e.value === 'UNLOCKED') return timed(false, [e], now);
	return null;
}

function num(e: Entry | null): number | null {
	return e && typeof e.value === 'number' && Number.isFinite(e.value) ? e.value : null;
}

function parseBattery(energy: unknown, now: IsoUtc): CarState['battery'] {
	const d = dataOf(energy);
	if (!d) return null;
	const level = entry(d.batteryChargeLevel);
	const percent = num(level);
	if (percent === null) return null;
	const range = entry(d.electricRange);
	const status = entry(d.chargingStatus);
	const mins = entry(d.estimatedChargingTimeToTargetBatteryChargeLevel);
	const chargingStatus = typeof status?.value === 'string' ? status.value : 'UNKNOWN';
	const m = num(mins);
	const newest = timed(null, [level, range, status, mins], now).at;
	const estFullAt =
		chargingStatus === 'CHARGING' && m !== null && m > 0
			? (new Date(Date.parse(newest) + m * 60_000).toISOString() as IsoUtc)
			: null;
	return timed({ percent, rangeKm: num(range), chargingStatus, estFullAt }, [level, range, status, mins], now);
}

function parseOdometer(odometer: unknown, now: IsoUtc): CarState['odometerKm'] {
	const e = entry(dataOf(odometer)?.odometer);
	const v = num(e);
	return e && v !== null ? timed(v, [e], now) : null;
}

function parseTyres(tyres: unknown, now: IsoUtc): CarState['tyres'] {
	const d = dataOf(tyres);
	if (!d) return null;
	const out: Record<string, string> = {};
	const used: Entry[] = [];
	for (const [k, v] of Object.entries(d)) {
		const e = entry(v);
		if (e && typeof e.value === 'string') {
			out[k] = e.value;
			used.push(e);
		}
	}
	return used.length ? timed(out, used, now) : null;
}

const OK_WARNING = new Set(['NO_WARNING', 'UNSPECIFIED']);

function parseWarnings(warnings: unknown, now: IsoUtc): CarState['warnings'] {
	const d = dataOf(warnings);
	if (!d) return null;
	const bad: string[] = [];
	const used: Entry[] = [];
	for (const [k, v] of Object.entries(d)) {
		const e = entry(v);
		if (e && typeof e.value === 'string') {
			used.push(e);
			if (!OK_WARNING.has(e.value)) bad.push(k);
		}
	}
	return used.length ? timed(bad, used, now) : null;
}

function parseService(diagnostics: unknown, now: IsoUtc): CarState['service'] {
	const d = dataOf(diagnostics);
	if (!d) return null;
	const status = entry(d.serviceWarning);
	const dist = entry(d.distanceToService);
	const time = entry(d.timeToService);
	if (typeof status?.value !== 'string') return null;
	const t = num(time);
	const unit = isObj(d.timeToService) ? d.timeToService.unit : undefined;
	const days = t === null ? null : unit === 'months' ? Math.round(t * 30) : unit === 'days' ? t : null;
	return timed({ status: status.value, distanceKm: num(dist), days }, [status, dist, time], now);
}

function parseLocation(location: unknown, now: IsoUtc): CarState['location'] {
	if (!isObj(location) || !isObj(location.data)) return null;
	const g = location.data.geometry;
	const coords = isObj(g) ? g.coordinates : undefined;
	if (!Array.isArray(coords)) return null;
	const [lng, lat] = coords;
	if (typeof lng !== 'number' || typeof lat !== 'number') return null;
	const p = location.data.properties;
	const e = entry(isObj(p) ? { value: 0, timestamp: p.timestamp } : null);
	return timed({ lat, lng }, [e], now);
}

function parseTrips(statistics: unknown, now: IsoUtc): CarState['trips'] {
	const d = dataOf(statistics);
	if (!d) return null;
	const out: Record<string, number> = {};
	const used: Entry[] = [];
	for (const [k, v] of Object.entries(d)) {
		const e = entry(v);
		const n = num(e);
		if (e && n !== null) {
			out[k] = n;
			used.push(e);
		}
	}
	return used.length ? timed(out, used, now) : null;
}

export function parseCarState(
	raw: {
		vehicles: unknown;
		doors?: unknown;
		windows?: unknown;
		odometer?: unknown;
		tyres?: unknown;
		warnings?: unknown;
		energy?: unknown;
		location?: unknown;
		diagnostics?: unknown;
		statistics?: unknown;
	},
	nowUtc: IsoUtc,
): CarState {
	const list = isObj(raw.vehicles) ? raw.vehicles.data : undefined;
	const first = Array.isArray(list) ? list[0] : undefined;
	const vin = isObj(first) ? first.vin : undefined;
	if (typeof vin !== 'string' || vin.length < 4) throw new Error('Volvo vehicles response has no VIN');
	return {
		vinLast4: vin.slice(-4),
		battery: guard(() => parseBattery(raw.energy, nowUtc)),
		locked: guard(() => parseLocked(raw.doors, nowUtc)),
		openings: guard(() => parseOpenings(raw.doors, raw.windows, nowUtc)),
		tyres: guard(() => parseTyres(raw.tyres, nowUtc)),
		warnings: guard(() => parseWarnings(raw.warnings, nowUtc)),
		service: guard(() => parseService(raw.diagnostics, nowUtc)),
		odometerKm: guard(() => parseOdometer(raw.odometer, nowUtc)),
		location: guard(() => parseLocation(raw.location, nowUtc)),
		trips: guard(() => parseTrips(raw.statistics, nowUtc)),
		updatedAt: nowUtc,
	};
}
