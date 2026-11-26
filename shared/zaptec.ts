import { floorHourUtc, utcHoursBetween } from './time';
import type { IsoUtc, Session, SessionHour } from './types';

const HOUR_MS = 3_600_000;
// Zaptec stamps its hourly readings a fraction of a second after the hour
// (e.g. 00:00:00.179). Treat a timestamp this close after a boundary as the
// boundary itself so the lag does not leak a sliver of energy into the next hour.
const SNAP_MS = 2000;

function snapToHour(ms: number): number {
	const floor = Math.floor(ms / HOUR_MS) * HOUR_MS;
	return ms - floor <= SNAP_MS ? floor : ms;
}

/** Zaptec timestamps are UTC; some lack an offset. Normalise to `toISOString()`. */
export function parseZaptecTime(s: string): IsoUtc {
	const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
	const ms = Date.parse(hasOffset ? s : `${s}Z`);
	if (Number.isNaN(ms)) throw new Error(`Invalid Zaptec timestamp: ${s}`);
	return new Date(ms).toISOString();
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// Case-insensitive key lookup so PascalCase and camelCase both work.
function get(o: Obj, key: string): unknown {
	const lower = key.toLowerCase();
	for (const k of Object.keys(o)) if (k.toLowerCase() === lower) return o[k];
	return undefined;
}

// Charging power assumed when a session has no interval to measure it from (a typical 11 kW wallbox).
const FALLBACK_KW = 11;
// Intervals shorter than this give unreliable rates (a few Wh over seconds), so they are not used to measure one.
const MIN_RATE_INTERVAL_MS = 15 * 60_000;

interface Interval {
	fromMs: number;
	toMs: number;
	kWh: number;
}

/**
 * Place `kWh` delivered in [fromMs, toMs) into UTC clock hours, filling backwards from `toMs` at no more
 * than `kw`. Zaptec writes a reading only for hours with energy, so after a gap (the car waiting on its
 * own timer) the energy was delivered just before the reading, not evenly across the idle hours.
 */
function backfill({ fromMs, toMs, kWh }: Interval, kw: number, acc: Map<IsoUtc, number>): void {
	if (toMs <= fromMs) {
		const h = floorHourUtc(new Date(toMs).toISOString());
		acc.set(h, (acc.get(h) ?? 0) + kWh);
		return;
	}
	// Never assume a rate too low to fit the energy into the interval.
	const rate = Math.max(kw, (kWh * HOUR_MS) / (toMs - fromMs));
	let left = kWh;
	const hours = utcHoursBetween(new Date(fromMs).toISOString(), new Date(toMs).toISOString()).reverse();
	for (const [i, h] of hours.entries()) {
		const hs = Date.parse(h);
		const overlap = Math.min(toMs, hs + HOUR_MS) - Math.max(fromMs, hs);
		if (overlap <= 0) continue;
		const put = i === hours.length - 1 ? left : Math.min(left, (rate * overlap) / HOUR_MS);
		if (put > 0) acc.set(h, (acc.get(h) ?? 0) + put);
		left -= put;
		if (left <= 1e-9) break;
	}
}

/** The session's charging power, measured from its readings that span at least 15 minutes. */
function observedKw(intervals: Interval[]): number {
	let kw = 0;
	for (const iv of intervals) {
		const ms = iv.toMs - iv.fromMs;
		if (ms >= MIN_RATE_INTERVAL_MS && ms <= HOUR_MS + SNAP_MS) kw = Math.max(kw, (iv.kWh * HOUR_MS) / ms);
	}
	return kw > 0 ? kw : FALLBACK_KW;
}

function parseSession(raw: unknown): Session | null {
	if (!isObj(raw)) return null;
	const energy = Number(get(raw, 'energy'));
	if (!(energy > 0)) return null;
	const id = String(get(raw, 'id'));
	const startUtc = parseZaptecTime(String(get(raw, 'startDateTime')));
	const endUtc = parseZaptecTime(String(get(raw, 'endDateTime')));
	const details = get(raw, 'energyDetails');

	const startMs = Date.parse(startUtc);
	const endMs = Date.parse(endUtc);
	const intervals: Interval[] = [];
	let prevMs = startMs;
	let detailed = 0;
	for (const d of Array.isArray(details) ? details : []) {
		if (!isObj(d)) continue;
		const tMs = snapToHour(Date.parse(parseZaptecTime(String(get(d, 'timestamp')))));
		const e = Number(get(d, 'energy'));
		if (e > 0) {
			intervals.push({ fromMs: Math.max(prevMs, startMs), toMs: tMs, kWh: e });
			detailed += e;
		}
		prevMs = tMs;
	}
	// Energy the readings do not account for (missing details) would otherwise price as 0 kr: place it
	// before the session end like any other late reading.
	const missing = energy - detailed;
	if (missing > 0.01) intervals.push({ fromMs: Math.min(prevMs, endMs), toMs: endMs, kWh: missing });

	const kw = observedKw(intervals);
	const acc = new Map<IsoUtc, number>();
	for (const iv of intervals) backfill(iv, kw, acc);

	// Each hour is rounded to 3 decimals after placing, so the hour sum may
	// differ from the session total by rounding.
	const hours: SessionHour[] = [...acc]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([hourStartUtc, kWh]) => ({ hourStartUtc, kWh: Math.round(kWh * 1000) / 1000 }))
		.filter(h => h.kWh > 0);

	return { id, startUtc, endUtc, kWh: energy, hours };
}

/** Parse a Zaptec chargehistory page. Never reads personal fields. */
export function parseZaptecSessions(page: unknown): Session[] {
	const data = isObj(page) ? get(page, 'data') : undefined;
	if (!Array.isArray(data)) throw new Error('Zaptec page has no Data array');
	return data.map(parseSession).filter((s): s is Session => s !== null);
}

/**
 * Like `parseZaptecSessions`, but a row that fails to parse (for example a bad timestamp) is skipped
 * and counted instead of failing the whole page. A page without a Data array still throws.
 */
export function parseZaptecSessionsSafe(page: unknown): { sessions: Session[]; skipped: number } {
	const data = isObj(page) ? get(page, 'data') : undefined;
	if (!Array.isArray(data)) throw new Error('Zaptec page has no Data array');
	const sessions: Session[] = [];
	let skipped = 0;
	for (const raw of data) {
		try {
			const s = parseSession(raw);
			if (s) sessions.push(s);
		} catch {
			skipped++;
		}
	}
	return { sessions, skipped };
}
