import { logger } from 'firebase-functions/v2';
import type { FetchFn } from './volvoAuth';

export const VOLVO_BASE = 'https://api.volvocars.com';
export const JSON_ACCEPT = 'application/json';
export const ENERGY_ACCEPT = 'application/vnd.volvocars.api.energy.vehicledata.v1+json';

const REQUEST_TIMEOUT_MS = 15_000;

export const vehiclePaths = {
	vehicles: () => '/connected-vehicle/v2/vehicles',
	section: (vin: string, name: string) => `/connected-vehicle/v2/vehicles/${vin}/${name}`,
	energy: (vin: string) => `/energy/v2/vehicles/${vin}/state`,
	location: (vin: string) => `/location/v1/vehicles/${vin}/location`,
	command: (vin: string, name: string) => `/connected-vehicle/v2/vehicles/${vin}/commands/${name}`,
};

export type SectionName = 'doors' | 'windows' | 'odometer' | 'tyres' | 'warnings' | 'diagnostics' | 'statistics';
export type CommandName = 'lock' | 'climatization-start' | 'climatization-stop';
export type CommandResult = { ok: boolean; status: string; message?: string };

const COMMANDS: readonly string[] = ['lock', 'climatization-start', 'climatization-stop'];
const COMMAND_OK = new Set(['COMPLETED', 'DELIVERED']);

export interface VolvoClient {
	vehicles(): Promise<unknown>;
	section(vin: string, name: SectionName): Promise<unknown>;
	energy(vin: string): Promise<unknown>;
	location(vin: string): Promise<unknown>;
	command(vin: string, name: CommandName): Promise<CommandResult>;
}

/**
 * Failed reads resolve `undefined` and are logged with the endpoint name and status only (never the
 * VIN, token or body). A failing `getToken` (for example VolvoReconnectRequired) still throws.
 */
export function createVolvoClient(
	apiKey: string,
	getToken: () => Promise<string>,
	fetchFn: FetchFn = fetch
): VolvoClient {
	const call = async (label: string, path: string, accept: string, init: RequestInit = {}) => {
		const token = await getToken();
		try {
			const res = await fetchFn(`${VOLVO_BASE}${path}`, {
				...init,
				headers: {
					...(init.headers as Record<string, string> | undefined),
					Authorization: `Bearer ${token}`,
					'vcc-api-key': apiKey,
					Accept: accept,
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			const body: unknown = await res.json().catch(() => undefined);
			return { status: res.status, ok: res.ok, body };
		} catch {
			logger.warn('Volvo request failed', { endpoint: label, status: 'network' });
			return null;
		}
	};

	const read = async (label: string, path: string, accept = JSON_ACCEPT): Promise<unknown> => {
		const r = await call(label, path, accept);
		if (!r) return undefined;
		if (!r.ok) {
			logger.warn('Volvo request failed', { endpoint: label, status: r.status });
			return undefined;
		}
		return r.body;
	};

	return {
		vehicles: () => read('vehicles', vehiclePaths.vehicles()),
		section: (vin, name) => read(name, vehiclePaths.section(vin, name)),
		energy: vin => read('energy', vehiclePaths.energy(vin), ENERGY_ACCEPT),
		location: vin => read('location', vehiclePaths.location(vin)),
		async command(vin, name) {
			if (!COMMANDS.includes(name)) throw new Error(`Unsupported Volvo command: ${String(name)}`);
			const r = await call(`command:${name}`, vehiclePaths.command(vin, name), JSON_ACCEPT, {
				method: 'POST',
				headers: { 'Content-Type': JSON_ACCEPT },
				body: '{}',
			});
			if (!r) return { ok: false, status: 'network' };
			const data = (r.body as { data?: { invokeStatus?: unknown; message?: unknown } } | undefined)?.data;
			const status = typeof data?.invokeStatus === 'string' ? data.invokeStatus : String(r.status);
			const message = typeof data?.message === 'string' ? data.message : undefined;
			return { ok: r.ok && COMMAND_OK.has(status), status, ...(message ? { message } : {}) };
		},
	};
}
