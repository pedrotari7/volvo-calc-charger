import type { IsoUtc } from './types';

const TZ = 'Europe/Stockholm';
const HOUR_MS = 3_600_000;

const fmt = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

interface Wall {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

function wall(ms: number): Wall {
	const o: Record<string, number> = {};
	for (const p of fmt.formatToParts(new Date(ms))) {
		if (p.type !== 'literal') o[p.type] = Number(p.value);
	}
	return { year: o.year!, month: o.month!, day: o.day!, hour: o.hour!, minute: o.minute! };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const dateStr = (w: Wall) => `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;

function toIso(ms: number): IsoUtc {
	return new Date(ms).toISOString() as IsoUtc;
}

export function floorHourUtc(iso: string): IsoUtc {
	return toIso(Math.floor(Date.parse(iso) / HOUR_MS) * HOUR_MS);
}

export function addHours(iso: IsoUtc, n: number): IsoUtc {
	return toIso(Date.parse(iso) + n * HOUR_MS);
}

export function localParts(iso: string): { date: string; hour: number; weekday: number; month: number } {
	const w = wall(Date.parse(iso));
	const dow = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
	return { date: dateStr(w), hour: w.hour, weekday: dow === 0 ? 7 : dow, month: w.month };
}

export function localDateOf(iso: string): string {
	return localParts(iso).date;
}

/**
 * The evening a moment belongs to, as the `plans/{date}` key: the local date from 12:00 on,
 * otherwise the previous local date. Steps back a calendar day, not 24 hours, so DST is harmless.
 */
export function eveningDateOf(iso: string): string {
	const p = localParts(iso);
	if (p.hour >= 12) return p.date;
	const [y, m, d] = p.date.split('-').map(Number) as [number, number, number];
	const prev = new Date(Date.UTC(y, m - 1, d - 1));
	return `${pad(prev.getUTCFullYear(), 4)}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

export function monthKey(iso: string): string {
	return localDateOf(iso).slice(0, 7);
}

export function utcHoursBetween(startIso: string, endIso: string): IsoUtc[] {
	const end = Date.parse(endIso);
	const out: IsoUtc[] = [];
	for (let t = Math.floor(Date.parse(startIso) / HOUR_MS) * HOUR_MS; t < end; t += HOUR_MS) {
		out.push(toIso(t));
	}
	return out;
}

export function nextLocalTime(nowIso: IsoUtc, hhmm: string): IsoUtc {
	const [h, m] = hhmm.split(':').map(Number) as [number, number];
	const now = Date.parse(nowIso);
	const today = wall(now);
	for (let add = 0; add <= 3; add++) {
		const naive = Date.UTC(today.year, today.month - 1, today.day + add, h, m);
		// Stockholm is UTC+1 or UTC+2; keep candidates whose wall clock matches (handles gaps/overlaps).
		const hits = [2, 1]
			.map(off => naive - off * HOUR_MS)
			.filter(ms => {
				const w = wall(ms);
				return w.hour === h && w.minute === m && w.day === new Date(naive).getUTCDate();
			})
			.filter(ms => ms > now);
		if (hits.length) return toIso(Math.min(...hits));
	}
	throw new Error(`No local time ${hhmm} found after ${nowIso}`);
}
