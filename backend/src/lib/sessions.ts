import { computeMonthPeaks, peakShares } from '../../../shared/peaks';
import { priceDocDatesFor } from '../../../shared/prices';
import { priceSession } from '../../../shared/pricing';
import { selectTariff } from '../../../shared/tariff';
import { addHours, monthKey } from '../../../shared/time';
import type { MonthPeaks, PriceDay, Session, Tariff } from '../../../shared/types';
import { db } from './firebase';

const sessionOf = (d: FirebaseFirestore.DocumentSnapshot): Session => ({ ...(d.data() as Session), id: d.id });

/** First UTC hour whose local month is `month` (YYYY-MM). */
function firstHourOfMonth(month: string): string {
	let t = new Date(`${month}-01T00:00:00Z`).toISOString();
	t = addHours(t, -2);
	while (monthKey(t) !== month) t = addHours(t, 1);
	return t;
}

function nextMonth(month: string): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * The tariff for a month's peak fee: the one in force at the month's first hour, else the one in force
 * at its last hour (a tariff that starts mid-month), else none.
 */
function tariffForMonth(tariffs: Tariff[], month: string): Tariff | null {
	return (
		selectTariff(tariffs, firstHourOfMonth(month)) ??
		selectTariff(tariffs, addHours(firstHourOfMonth(nextMonth(month)), -1))
	);
}

async function loadPriceDays(dates: string[]): Promise<Record<string, PriceDay>> {
	const snaps = await Promise.all(dates.map(d => db.doc(`prices/${d}`).get()));
	const days: Record<string, PriceDay> = {};
	for (const s of snaps) if (s.exists) days[s.id] = s.data() as PriceDay;
	return days;
}

async function sessionsOfMonth(month: string): Promise<Session[]> {
	const start = addHours(firstHourOfMonth(month), -24 * 3);
	const end = new Date(Date.parse(start) + 24 * 3_600_000 * 38).toISOString();
	const snap = await db.collection('sessions').where('startUtc', '>=', start).where('startUtc', '<', end).get();
	return snap.docs.map(sessionOf).filter(s => s.hours.some(h => monthKey(h.hourStartUtc) === month));
}

/**
 * Prices the given sessions with the stored prices and tariffs, then recomputes `peaks/{month}`
 * for every month they touch and writes each month session's `peakShare`. Idempotent.
 */
export async function repriceAndUpdatePeaks(sessionIds: string[]): Promise<void> {
	if (sessionIds.length === 0) return;
	const tariffs = (await db.collection('tariffs').get()).docs.map(d => ({ ...(d.data() as Tariff), id: d.id }));
	const snaps = await Promise.all(sessionIds.map(id => db.doc(`sessions/${id}`).get()));
	const sessions = snaps.filter(s => s.exists).map(sessionOf);

	const days = await loadPriceDays(priceDocDatesFor(sessions.flatMap(s => s.hours.map(h => h.hourStartUtc))));
	const months = new Set<string>();
	const batch = db.batch();
	for (const s of sessions) {
		const { status, cost } = priceSession(s, days, tariffs);
		batch.update(db.doc(`sessions/${s.id}`), { status, cost });
		for (const h of s.hours) months.add(monthKey(h.hourStartUtc));
	}
	await batch.commit();

	const computed = new Map<string, MonthPeaks>();
	const affected = new Map<string, Session>();
	for (const month of months) {
		const tariff = tariffForMonth(tariffs, month);
		if (!tariff) continue;
		const all = await sessionsOfMonth(month);
		const peaks = computeMonthPeaks(month, all, tariff);
		const existing = (await db.doc(`peaks/${month}`).get()).data();
		await db.doc(`peaks/${month}`).set({ ...peaks, final: existing?.final ?? false });
		computed.set(month, peaks);
		for (const s of all) affected.set(s.id, s);
	}

	// A session's peakShare is the sum of its shares in every month it touches.
	const sharesOf = new Map<string, Record<string, number>>();
	const monthShares = async (month: string): Promise<Record<string, number>> => {
		let shares = sharesOf.get(month);
		if (!shares) {
			const peaks =
				computed.get(month) ?? ((await db.doc(`peaks/${month}`).get()).data() as MonthPeaks | undefined);
			shares = peaks ? peakShares(peaks) : {};
			sharesOf.set(month, shares);
		}
		return shares;
	};
	const out = db.batch();
	for (const s of affected.values()) {
		let total = 0;
		for (const month of new Set(s.hours.map(h => monthKey(h.hourStartUtc))))
			total += (await monthShares(month))[s.id] ?? 0;
		out.update(db.doc(`sessions/${s.id}`), { peakShare: total });
	}
	await out.commit();
}
