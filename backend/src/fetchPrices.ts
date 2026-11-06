import { onSchedule } from 'firebase-functions/v2/scheduler';
import { addHours, localDateOf } from '../../shared/time';
import type { IsoUtc } from '../../shared/types';
import { db } from './lib/firebase';
import { repriceAndUpdatePeaks } from './lib/sessions';
import type { FetchFn } from './providers/elpriset';
import { fetchPriceDay } from './providers/elpriset';

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

	const written: string[] = [];
	for (const date of [...new Set(dates)]) {
		const ref = db.doc(`prices/${date}`);
		if ((await ref.get()).exists) continue;
		const day = await fetchPriceDay(date, fetchFn);
		if (!day) continue;
		await ref.set(day);
		written.push(date);
	}

	let repriced: string[] = [];
	if (written.length > 0) {
		repriced = (await db.collection('sessions').where('status', '==', 'pending').get()).docs.map(d => d.id);
		await repriceAndUpdatePeaks(repriced);
	}

	const tomorrowArrived = written.includes(tomorrow);
	if (tomorrowArrived) await deps.onTomorrowArrived();
	return { written, repriced, tomorrowArrived };
}

const run = () => runFetchPrices(new Date().toISOString(), { onTomorrowArrived: async () => {} });

export const fetchPrices = onSchedule({ schedule: 'every day 13:30', timeZone: 'Europe/Stockholm' }, async () => {
	await run();
});

export const fetchPricesHourly = onSchedule({ schedule: 'every 1 hours', timeZone: 'Europe/Stockholm' }, async () => {
	await run();
});
