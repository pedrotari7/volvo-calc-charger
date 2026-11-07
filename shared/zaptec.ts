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

// Spread `kWh` over the UTC hours overlapped by [fromMs, toMs), proportional to overlap.
function spread(fromMs: number, toMs: number, kWh: number, acc: Map<IsoUtc, number>): void {
	if (toMs <= fromMs) {
		const h = floorHourUtc(new Date(toMs).toISOString());
		acc.set(h, (acc.get(h) ?? 0) + kWh);
		return;
	}
	const span = toMs - fromMs;
	for (const h of utcHoursBetween(new Date(fromMs).toISOString(), new Date(toMs).toISOString())) {
		const hs = Date.parse(h);
		const overlap = Math.min(toMs, hs + HOUR_MS) - Math.max(fromMs, hs);
		if (overlap > 0) acc.set(h, (acc.get(h) ?? 0) + (kWh * overlap) / span);
	}
}

function parseSession(raw: unknown): Session | null {
	if (!isObj(raw)) return null;
	const energy = Number(get(raw, 'energy'));
	if (!(energy > 0)) return null;
	const id = String(get(raw, 'id'));
	const startUtc = parseZaptecTime(String(get(raw, 'startDateTime')));
	const endUtc = parseZaptecTime(String(get(raw, 'endDateTime')));
	const details = get(raw, 'energyDetails');

	const acc = new Map<IsoUtc, number>();
	const startMs = Date.parse(startUtc);
	let prevMs = startMs;
	for (const d of Array.isArray(details) ? details : []) {
		if (!isObj(d)) continue;
		const tMs = snapToHour(Date.parse(parseZaptecTime(String(get(d, 'timestamp')))));
		const e = Number(get(d, 'energy'));
		if (e > 0) spread(Math.max(prevMs, startMs), tMs, e, acc);
		prevMs = tMs;
	}

	// Each hour is rounded to 3 decimals after spreading, so the hour sum may
	// differ from the session total by rounding (and by Zaptec's own gaps).
	const hours: SessionHour[] = [...acc]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([hourStartUtc, kWh]) => ({ hourStartUtc, kWh: Math.round(kWh * 1000) / 1000 }))
		.filter((h) => h.kWh > 0);

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
