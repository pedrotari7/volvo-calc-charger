import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertAllowed } from './lib/allowlist';
import { VOLVO_API_KEY, VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET } from './lib/secrets';
import type { CommandName, CommandResult, VolvoClient } from './providers/volvo';
import { createVolvoClient } from './providers/volvo';
import { getAccessToken, VolvoReconnectRequired } from './providers/volvoAuth';

export interface CommandDeps {
	client: VolvoClient;
}

/** One allowlist check, one vehicle lookup, one POST. Never retries. */
export async function runCommand(
	auth: CallableRequest['auth'],
	name: CommandName,
	deps: CommandDeps
): Promise<CommandResult> {
	await assertAllowed(auth);
	try {
		const vehicles = await deps.client.vehicles();
		const vin = (vehicles as { data?: Array<{ vin?: unknown }> } | undefined)?.data?.[0]?.vin;
		if (typeof vin !== 'string') throw new HttpsError('not-found', 'no-vehicle');
		return await deps.client.command(vin, name);
	} catch (err) {
		if (err instanceof VolvoReconnectRequired) throw new HttpsError('failed-precondition', 'volvo-reconnect');
		throw err;
	}
}

const options = { secrets: [VOLVO_CLIENT_ID, VOLVO_CLIENT_SECRET, VOLVO_API_KEY] };

const liveDeps = (): CommandDeps => {
	const creds = { clientId: VOLVO_CLIENT_ID.value(), clientSecret: VOLVO_CLIENT_SECRET.value() };
	return { client: createVolvoClient(VOLVO_API_KEY.value(), () => getAccessToken(creds)) };
};

export const lockCar = onCall(options, req => runCommand(req.auth, 'lock', liveDeps()));
export const startClimate = onCall(options, req => runCommand(req.auth, 'climatization-start', liveDeps()));
export const stopClimate = onCall(options, req => runCommand(req.auth, 'climatization-stop', liveDeps()));
