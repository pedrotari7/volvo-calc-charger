import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { formatKr, formatKwh } from '../../shared/format';
import { eveningDateOf } from '../../shared/time';
import type { IsoUtc, Plan, PricedSession, Session, SessionHour } from '../../shared/types';
import { parseZaptecSessionsSafe } from '../../shared/zaptec';
import { db } from './lib/firebase';
import { sendPush } from './lib/push';
import { ZAPTEC_PASSWORD, ZAPTEC_USERNAME } from './lib/secrets';
import { repriceAndUpdatePeaks } from './lib/sessions';
import type { ZaptecClient } from './providers/zaptec';
import { createZaptecClient } from './providers/zaptec';

export interface PollZaptecDeps {
	client: ZaptecClient;
}

const sameHours = (a: SessionHour[], b: SessionHour[]): boolean =>
	a.length === b.length && a.every((h, i) => h.hourStartUtc === b[i].hourStartUtc && h.kWh === b[i].kWh);

const PLAN_LEAD_MS = 3 * 3_600_000;
const NOTIFY_WINDOW_MS = 24 * 3_600_000;

/**
 * The recommendation of the evening plan the session belongs to, if the session started within
 * [recommendation.start - 3 h, recommendation.end]; otherwise null.
 */
async function plannedFor(s: Session): Promise<PricedSession['planned']> {
	const plan = (await db.doc(`plans/${eveningDateOf(s.startUtc)}`).get()).data() as Plan | undefined;
	const rec = plan?.recommendation;
	if (!rec) return null;
	const t = Date.parse(s.startUtc);
	if (t < Date.parse(rec.start) - PLAN_LEAD_MS || t > Date.parse(rec.end)) return null;
	return { kw: rec.kw, start: rec.start, end: rec.end, energyCost: rec.energyCost, cost: rec.cost };
}

export async function runPollZaptec(nowUtc: IsoUtc, deps: PollZaptecDeps): Promise<{ newSessions: string[] }> {
	const { client } = deps;
	let ok = true;
	try {
		const state = await client.chargerState();
		await db.doc('charger/state').set({ ...state, updatedAt: nowUtc });
	} catch (e) {
		ok = false;
		logger.warn('pollZaptec: charger state failed', { error: e instanceof Error ? e.message : 'unknown' });
	}

	const page = await client.history();
	let parsed;
	try {
		const r = parseZaptecSessionsSafe(page);
		parsed = r.sessions;
		if (r.skipped > 0) logger.warn('pollZaptec: skipped malformed sessions', { skipped: r.skipped });
	} catch (e) {
		logger.warn('pollZaptec: malformed history page', { error: e instanceof Error ? e.message : 'unknown' });
		return { newSessions: [] };
	}

	const known = await Promise.all(parsed.map(s => db.doc(`sessions/${s.id}`).get()));
	const fresh = parsed.filter((_, i) => !known[i].exists);

	// A known session whose energy changed (Zaptec finalised it later) is updated and repriced.
	// `notified` is never touched, so it is not pushed again.
	const changed: string[] = [];
	for (const [i, s] of parsed.entries()) {
		const stored = known[i].data() as PricedSession | undefined;
		if (!stored) continue;
		if (stored.kWh === s.kWh && sameHours(stored.hours, s.hours)) continue;
		await db.doc(`sessions/${s.id}`).update({ kWh: s.kWh, hours: s.hours, endUtc: s.endUtc, status: 'pending' });
		changed.push(s.id);
	}

	for (const s of fresh) {
		const doc: Omit<PricedSession, 'id'> & { notified: boolean } = {
			startUtc: s.startUtc,
			endUtc: s.endUtc,
			kWh: s.kWh,
			hours: s.hours,
			status: 'pending',
			cost: null,
			peakShare: 0,
			// Sessions that ended long ago (e.g. history read on first deploy) are not pushed.
			notified: Date.parse(s.endUtc) < Date.parse(nowUtc) - NOTIFY_WINDOW_MS,
			planned: await plannedFor(s),
		};
		await db.doc(`sessions/${s.id}`).set(doc);
	}

	const newSessions = fresh.map(s => s.id);
	try {
		await repriceAndUpdatePeaks([...newSessions, ...changed]);
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
			logger.warn('pollZaptec: notify failed', {
				sessionId: id,
				error: e instanceof Error ? e.message : 'unknown',
			});
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
