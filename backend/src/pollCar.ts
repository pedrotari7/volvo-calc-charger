import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { leftOpenIssues, leftOpenMessage, reconnectDue, shouldSendLeftOpen } from '../../shared/alerts';
import { localDateOf } from '../../shared/time';
import type { IsoUtc } from '../../shared/types';
import { parseCarState } from '../../shared/volvo';
import { db } from './lib/firebase';
import { sendPush } from './lib/push';
import { VOLVO_API_KEY, VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET } from './lib/secrets';
import type { VolvoClient } from './providers/volvo';
import { createVolvoClient } from './providers/volvo';
import { getAccessToken, VolvoReconnectRequired } from './providers/volvoAuth';

export interface PollCarDeps {
	client: VolvoClient;
}

const reconnectPush = (kind: 'failed' | 'due', grantStartedAt: string) =>
	sendPush({
		kind: 'reconnect',
		title: 'Reconnect Volvo',
		body:
			kind === 'failed'
				? 'The Volvo connection has expired. Sign in again to keep car data updating.'
				: 'The Volvo connection expires soon. Sign in again to keep car data updating.',
		dedupeKey: `reconnect:${kind}:${grantStartedAt}`,
		url: '/settings',
	});

export async function runPollCar(nowUtc: IsoUtc, deps: PollCarDeps): Promise<void> {
	const { client } = deps;
	const volvo = (await db.doc('private/volvo').get()).data();
	if (!volvo) return;
	const grantStartedAt = typeof volvo.grantStartedAt === 'string' ? volvo.grantStartedAt : 'unknown';
	// A dead refresh token must not be spent again; wait for the owner to reconnect.
	if (volvo.lastRefreshError && !(Date.parse(volvo.accessExpiresAt ?? '') > Date.parse(nowUtc))) return;

	let raw;
	try {
		const vehicles = await client.vehicles();
		const list = (vehicles as { data?: Array<{ vin?: unknown }> } | undefined)?.data;
		const vin = list?.[0]?.vin;
		if (typeof vin !== 'string') {
			logger.warn('pollCar: no vehicle returned');
			return;
		}
		const [doors, windows, odometer, tyres, warnings, diagnostics, statistics, energy, location] =
			await Promise.all([
				client.section(vin, 'doors'),
				client.section(vin, 'windows'),
				client.section(vin, 'odometer'),
				client.section(vin, 'tyres'),
				client.section(vin, 'warnings'),
				client.section(vin, 'diagnostics'),
				client.section(vin, 'statistics'),
				client.energy(vin),
				client.location(vin),
			]);
		raw = { vehicles, doors, windows, odometer, tyres, warnings, diagnostics, statistics, energy, location };
		const sections = [doors, windows, odometer, tyres, warnings, diagnostics, statistics, energy, location];
		if (sections.every(s => s === undefined)) {
			logger.warn('pollCar: every section failed; keeping previous car/state');
			return;
		}
	} catch (e) {
		if (e instanceof VolvoReconnectRequired) {
			await reconnectPush('failed', grantStartedAt);
			return;
		}
		throw e;
	}

	const car = parseCarState(raw, nowUtc);
	await db.doc('car/state').set(car);
	if (car.odometerKm) {
		await db
			.doc(`odometer/${localDateOf(car.odometerKm.at)}`)
			.set({ km: car.odometerKm.value, at: car.odometerKm.at });
	}

	// Without door/window data we know nothing; leave the remembered key alone.
	if (car.locked || car.openings) {
		const leftOpenRef = db.doc('private/leftOpen');
		const lastKey = ((await leftOpenRef.get()).data()?.lastKey as string | null | undefined) ?? null;
		const issues = leftOpenIssues(car);
		const decision = shouldSendLeftOpen(issues, nowUtc, lastKey);
		if (decision.send) {
			await sendPush({
				kind: 'leftOpen',
				title: 'Car left open',
				body: leftOpenMessage(issues),
				dedupeKey: `leftOpen:${localDateOf(nowUtc)}:${issues.join(',')}`,
				url: '/car',
			});
		}
		if (decision.key !== lastKey) await leftOpenRef.set({ lastKey: decision.key });
	}

	if (grantStartedAt !== 'unknown' && reconnectDue(grantStartedAt, nowUtc)) {
		await reconnectPush('due', grantStartedAt);
	}
}

export const pollCar = onSchedule(
	{
		schedule: 'every 10 minutes',
		timeZone: 'Europe/Stockholm',
		secrets: [VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET, VOLVO_API_KEY],
	},
	async () => {
		const creds = { clientId: VOLVO_CLIENT_ID.value(), clientSecret: VOLVO_CLIENT_SECRET.value() };
		const client = createVolvoClient(VOLVO_API_KEY.value(), () => getAccessToken(creds));
		await runPollCar(new Date().toISOString(), { client });
	}
);
