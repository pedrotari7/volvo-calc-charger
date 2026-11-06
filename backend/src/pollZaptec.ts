import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { formatKr, formatKwh } from '../../shared/format';
import { localDateOf } from '../../shared/time';
import type { IsoUtc, PricedSession } from '../../shared/types';
import { parseZaptecSessions } from '../../shared/zaptec';
import { db } from './lib/firebase';
import { sendPush } from './lib/push';
import { ZAPTEC_PASSWORD, ZAPTEC_USERNAME } from './lib/secrets';
import { repriceAndUpdatePeaks } from './lib/sessions';
import type { ZaptecClient } from './providers/zaptec';
import { createZaptecClient } from './providers/zaptec';

export interface PollZaptecDeps {
	client: ZaptecClient;
}

export async function runPollZaptec(nowUtc: IsoUtc, deps: PollZaptecDeps): Promise<{ newSessions: string[] }> {
	const { client } = deps;
	const state = await client.chargerState();
	await db.doc('charger/state').set({ ...state, updatedAt: nowUtc });

	const page = await client.history();
	let parsed;
	try {
		parsed = parseZaptecSessions(page);
	} catch (e) {
		logger.warn('pollZaptec: malformed history page', { error: e instanceof Error ? e.message : 'unknown' });
		return { newSessions: [] };
	}

	const known = await Promise.all(parsed.map(s => db.doc(`sessions/${s.id}`).get()));
	const fresh = parsed.filter((_, i) => !known[i].exists);

	for (const s of fresh) {
		const plan = (await db.doc(`plans/${localDateOf(s.startUtc)}`).get()).data();
		const rec = plan?.recommendation as PricedSession['planned'];
		const doc: Omit<PricedSession, 'id'> & { notified: boolean } = {
			startUtc: s.startUtc,
			endUtc: s.endUtc,
			kWh: s.kWh,
			hours: s.hours,
			status: 'pending',
			cost: null,
			peakShare: 0,
			notified: false,
			planned: rec ? { kw: rec.kw, start: rec.start, end: rec.end, cost: rec.cost } : null,
		};
		await db.doc(`sessions/${s.id}`).set(doc);
	}

	const newSessions = fresh.map(s => s.id);
	let ok = true;
	try {
		await repriceAndUpdatePeaks(newSessions);
	} catch (e) {
		ok = false;
		logger.warn('pollZaptec: pricing failed', { error: e instanceof Error ? e.message : 'unknown' });
	}

	// Sessions not yet notified (just written, or left over from an earlier failed poll).
	const unnotified = (await db.collection('sessions').where('notified', '==', false).get()).docs.map(d => d.id);
	for (const id of unnotified) {
		try {
			const s = (await db.doc(`sessions/${id}`).get()).data() as PricedSession;
			const body =
				s.status === 'priced' && s.cost
					? `Charged ${formatKwh(s.kWh)} for ${formatKr(s.cost.total)} (${formatKr(s.cost.total / s.kWh)}/kWh)`
					: `Charged ${formatKwh(s.kWh)}, price pending`;
			await sendPush({
				kind: 'sessionDone',
				title: 'Charging done',
				body,
				dedupeKey: `session:${id}`,
				url: `/history/${id}`,
			});
			await db.doc(`sessions/${id}`).update({ notified: true });
		} catch (e) {
			ok = false;
			logger.warn('pollZaptec: notify failed', { sessionId: id, error: e instanceof Error ? e.message : 'unknown' });
		}
	}

	if (ok) await db.doc('status/zaptec').set({ lastOkAt: nowUtc });
	return { newSessions };
}

// Module-level so the cached token survives between invocations of a warm instance.
let client: ZaptecClient | undefined;

export const pollZaptec = onSchedule(
	{ schedule: 'every 5 minutes', timeZone: 'Europe/Stockholm', secrets: [ZAPTEC_USERNAME, ZAPTEC_PASSWORD] },
	async () => {
		client ??= createZaptecClient({ username: ZAPTEC_USERNAME.value(), password: ZAPTEC_PASSWORD.value() });
		await runPollZaptec(new Date().toISOString(), { client });
	}
);
