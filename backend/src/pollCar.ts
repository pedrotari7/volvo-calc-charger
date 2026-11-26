import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { leftOpenIssues, leftOpenMessage, reconnectDue, shouldSendLeftOpen } from '../../shared/alerts';
import { localDateOf } from '../../shared/time';
import type { IsoUtc } from '../../shared/types';
import { parseCarProfile, parseCarState } from '../../shared/volvo';
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

const PROFILE_MAX_AGE_MS = 24 * 3_600_000;

/**
 * Refreshes car/profile (model, paint, picture) when it is missing or a day old. Best effort: the car
 * poll never fails because of it, and a failed fetch keeps the previous profile.
 */
async function refreshProfile(client: VolvoClient, vin: string, nowUtc: IsoUtc): Promise<void> {
	try {
		const ref = db.doc('car/profile');
		const fetchedAt = (await ref.get()).data()?.fetchedAt;
		if (typeof fetchedAt === 'string' && Date.parse(nowUtc) - Date.parse(fetchedAt) < PROFILE_MAX_AGE_MS) return;
		const details = await client.details(vin);
		if (details === undefined) return;
		const profile = parseCarProfile(details, nowUtc);
		if (!profile) {
			const keys = details && typeof details === 'object' ? Object.keys(details) : [typeof details];
			logger.warn('pollCar: vehicle details had no profile fields', { keys });
			return;
		}
		await ref.set(profile);
	} catch (e) {
		logger.warn('pollCar: could not refresh car/profile', { error: e instanceof Error ? e.name : 'unknown' });
	}
}

export async function runPollCar(nowUtc: IsoUtc, deps: PollCarDeps): Promise<void> {
	const { client } = deps;
	const volvo = (await db.doc('private/volvo').get()).data();
	if (!volvo) return;
	const grantStartedAt = typeof volvo.grantStartedAt === 'string' ? volvo.grantStartedAt : 'unknown';
	// A dead refresh token must not be spent again; wait for the owner to reconnect.
	if (volvo.lastRefreshError && !(Date.parse(volvo.accessExpiresAt ?? '') > Date.parse(nowUtc))) return;

	let raw;
	let vin: string;
	try {
		const vehicles = await client.vehicles();
		const list = (vehicles as { data?: Array<{ vin?: unknown }> } | undefined)?.data;
		const first = list?.[0]?.vin;
		if (typeof first !== 'string') {
			logger.warn('pollCar: no vehicle returned');
			return;
		}
		vin = first;
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
	if (raw.energy !== undefined && !car.battery) {
		// Key names only (no values), to see what shape the Energy API actually sent.
		const keys = raw.energy && typeof raw.energy === 'object' ? Object.keys(raw.energy) : [typeof raw.energy];
		logger.warn('pollCar: energy answered but no battery level parsed', { keys });
	}
	await db.doc('car/state').set(car);
	await refreshProfile(client, vin, nowUtc);
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
