import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { addHours, localDateOf } from '../../shared/time';
import type { IsoUtc } from '../../shared/types';
import { db } from './lib/firebase';
import { repriceAndUpdatePeaks } from './lib/sessions';
import { runPlanTonight } from './planTonight';
import type { FetchFn } from './providers/elpriset';
import { ElprisetHttpError, fetchPriceDay } from './providers/elpriset';

export interface FetchPricesDeps {
	fetchFn?: FetchFn;
	onTomorrowArrived: () => Promise<unknown>;
}

export async function runFetchPrices(
	nowUtc: IsoUtc,
	deps: FetchPricesDeps
): Promise<{ written: string[]; repriced: string[]; tomorrowArrived: boolean }> {
	const fetchFn = deps.fetchFn ?? fetch;
	const today = localDateOf(nowUtc);
	const tomorrow = localDateOf(addHours(nowUtc, 24));
	const dates = [tomorrow, today];
	for (let k = 1; k <= 7; k++) dates.push(localDateOf(addHours(nowUtc, -24 * k)));

	// Older days that pending sessions still need (e.g. history imported on first deploy).
	const pendingDocs = (await db.collection('sessions').where('status', '==', 'pending').get()).docs;
	for (const d of pendingDocs) {
		const hours = (d.get('hours') as { hourStartUtc: IsoUtc }[] | undefined) ?? [];
		for (const h of hours) if (h.hourStartUtc < nowUtc) dates.push(localDateOf(h.hourStartUtc));
	}

	const written: string[] = [];
	const failed: string[] = [];
	for (const date of [...new Set(dates)]) {
		try {
			const ref = db.doc(`prices/${date}`);
			if ((await ref.get()).exists) continue;
			const day = await fetchPriceDay(date, fetchFn);
			if (!day) continue;
			await ref.set(day);
			written.push(date);
		} catch (e) {
			failed.push(date);
			logger.warn('fetchPrices: day failed', {
				date,
				status: e instanceof ElprisetHttpError ? e.status : undefined,
			});
		}
	}

	const pending = (await db.collection('sessions').where('status', '==', 'pending').get()).docs.map(d => d.id);
	if (pending.length > 0) await repriceAndUpdatePeaks(pending);
	const repriced = pending;

	const tomorrowArrived = written.includes(tomorrow);
	let hookFailed = false;
	if (tomorrowArrived) {
		try {
			await deps.onTomorrowArrived();
		} catch (e) {
			hookFailed = true;
			logger.error('fetchPrices: onTomorrowArrived failed', {
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}
	if (failed.length > 0 || hookFailed) {
		const parts = [
			...(failed.length > 0 ? [`failed days: ${failed.join(', ')}`] : []),
			...(hookFailed ? ['tomorrow hook failed'] : []),
		];
		throw new Error(`fetchPrices: ${parts.join('; ')}`);
	}
	return { written, repriced, tomorrowArrived };
}

const run = () =>
	runFetchPrices(new Date().toISOString(), { onTomorrowArrived: () => runPlanTonight(new Date().toISOString()) });

export const fetchPrices = onSchedule({ schedule: 'every day 13:30', timeZone: 'Europe/Stockholm' }, async () => {
	await run();
});

export const fetchPricesHourly = onSchedule({ schedule: 'every 1 hours', timeZone: 'Europe/Stockholm' }, async () => {
	await run();
});
