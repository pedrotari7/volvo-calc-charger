import { logger } from 'firebase-functions/v2';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isCarCommand } from '../../shared/commands';
import type { IsoUtc, RemoteState } from '../../shared/types';
import { assertAllowed } from './lib/allowlist';
import { db } from './lib/firebase';
import { VOLVO_API_KEY, VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET } from './lib/secrets';
import type { CommandName, CommandResult, VolvoClient } from './providers/volvo';
import { createVolvoClient } from './providers/volvo';
import { getAccessToken, VolvoReconnectRequired } from './providers/volvoAuth';

export interface CommandDeps {
	client: VolvoClient;
	now?: () => IsoUtc;
}

/**
 * Remembers the command in car/remote so every phone shows it, and tracks whether climate is running. Best
 * effort: the command already reached Volvo, so a failed write never turns it into an error.
 */
async function remember(name: CommandName, result: CommandResult, at: IsoUtc): Promise<void> {
	try {
		const update: Partial<RemoteState> = {
			last: { command: name, ok: result.ok, status: result.status, at },
		};
		if (result.ok && name === 'climatization-start') update.climateStartedAt = at;
		if (result.ok && name === 'climatization-stop') update.climateStartedAt = null;
		await db.doc('car/remote').set(update, { merge: true });
	} catch (e) {
		logger.warn('command: could not write car/remote', { error: e instanceof Error ? e.name : 'unknown' });
	}
}

/** One allowlist check, one vehicle lookup, one POST. Never retries. */
export async function runCommand(
	auth: CallableRequest['auth'],
	name: CommandName,
	deps: CommandDeps
): Promise<CommandResult> {
	await assertAllowed(auth);
	if (!isCarCommand(name)) throw new HttpsError('invalid-argument', 'unknown-command');
	let result: CommandResult;
	try {
		const vehicles = await deps.client.vehicles();
		const vin = (vehicles as { data?: Array<{ vin?: unknown }> } | undefined)?.data?.[0]?.vin;
		if (typeof vin !== 'string') throw new HttpsError('not-found', 'no-vehicle');
		result = await deps.client.command(vin, name);
	} catch (err) {
		if (err instanceof VolvoReconnectRequired) throw new HttpsError('failed-precondition', 'volvo-reconnect');
		throw err;
	}
	await remember(name, result, deps.now?.() ?? (new Date().toISOString() as IsoUtc));
	return result;
}

const options = { secrets: [VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET, VOLVO_API_KEY] };

const liveDeps = (): CommandDeps => {
	const creds = { clientId: VOLVO_CLIENT_ID.value(), clientSecret: VOLVO_CLIENT_SECRET.value() };
	return { client: createVolvoClient(VOLVO_API_KEY.value(), () => getAccessToken(creds)) };
};

/** `{ command: 'lock' | 'honk' | … }` → Volvo's answer. Unknown commands are refused before any Volvo call. */
export const carCommand = onCall(options, (req: CallableRequest<unknown>) => {
	const command = (req.data as { command?: unknown } | null)?.command;
	return runCommand(req.auth, command as CommandName, liveDeps());
});

// The original three callables, kept so an app version from before carCommand keeps working.
export const lockCar = onCall(options, req => runCommand(req.auth, 'lock', liveDeps()));
export const startClimate = onCall(options, req => runCommand(req.auth, 'climatization-start', liveDeps()));
export const stopClimate = onCall(options, req => runCommand(req.auth, 'climatization-stop', liveDeps()));
