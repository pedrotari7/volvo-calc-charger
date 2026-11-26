import { localParts } from './time';
import type { HighLoad, IsoUtc, Tariff } from './types';

export function selectTariff(tariffs: Tariff[], hourStartUtc: IsoUtc): Tariff | null {
	const date = localParts(hourStartUtc).date;
	let best: Tariff | null = null;
	for (const t of tariffs) {
		if (t.effectiveFrom <= date && (!best || t.effectiveFrom > best.effectiveFrom)) best = t;
	}
	return best;
}

/** Easter Sunday (Gregorian, anonymous algorithm) as UTC midnight of that date. */
function easterSunday(year: number): number {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return Date.UTC(year, month - 1, day);
}

const FIXED_HOLIDAYS = ['01-01', '01-06', '12-24', '12-25', '12-26', '12-31'];
const EASTER_OFFSETS = [-3, -2, 1]; // skärtorsdag, långfredag, annandag påsk

/**
 * Weekdays the grid company does not count as weekdays for high load: nyårsdagen, trettondag jul,
 * skärtorsdag, långfredag, annandag påsk, julafton, juldagen, annandag jul and nyårsafton.
 */
export function isHighLoadHoliday(date: string): boolean {
	if (FIXED_HOLIDAYS.includes(date.slice(5))) return true;
	const easter = easterSunday(Number(date.slice(0, 4)));
	return EASTER_OFFSETS.some(o => new Date(easter + o * 86_400_000).toISOString().slice(0, 10) === date);
}

export function isHighLoad(hl: HighLoad, hourStartUtc: IsoUtc): boolean {
	const p = localParts(hourStartUtc);
	if (!hl.months.includes(p.month)) return false;
	if (hl.weekdaysOnly && (p.weekday > 5 || isHighLoadHoliday(p.date))) return false;
	return p.hour >= hl.fromHour && p.hour < hl.toHour;
}

export const exVat = (incl: number, vatRate: number): number => incl / (1 + vatRate);
export const inclVat = (ex: number, vatRate: number): number => ex * (1 + vatRate);
