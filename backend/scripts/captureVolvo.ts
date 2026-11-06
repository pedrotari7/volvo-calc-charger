import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENERGY_ACCEPT, JSON_ACCEPT, VOLVO_BASE, vehiclePaths } from '../src/providers/volvo';
import { getAccessToken } from '../src/providers/volvoAuth';

// Usage (owner, after "Connect Volvo" on the deployed app):
//   VOLVO_CLIENT_ID=… VOLVO_CLIENT_SECRET=… VOLVO_API_KEY=… \
//   GOOGLE_APPLICATION_CREDENTIALS=… GCLOUD_PROJECT=<project> pnpm --filter backend capture-volvo
// Reads the real project's private/volvo, calls every snapshot endpoint once, and writes the
// responses to backend/test/fixtures/volvo/ with the VIN and coordinates replaced by the test values.

const TEST_VIN = 'YV1TESTVIN0000001';
const TEST_LAT = 59.31;
const TEST_LON = 18.16;
const BASE = VOLVO_BASE;
const OUT_DIR = path.resolve(__dirname, '../test/fixtures/volvo');

const endpoints: Array<{ name: string; path: (vin: string) => string; accept: string }> = [
	{ name: 'details', path: v => `/connected-vehicle/v2/vehicles/${v}`, accept: JSON_ACCEPT },
	{ name: 'doors', path: v => `/connected-vehicle/v2/vehicles/${v}/doors`, accept: JSON_ACCEPT },
	{ name: 'windows', path: v => `/connected-vehicle/v2/vehicles/${v}/windows`, accept: JSON_ACCEPT },
	{ name: 'odometer', path: v => `/connected-vehicle/v2/vehicles/${v}/odometer`, accept: JSON_ACCEPT },
	{ name: 'tyres', path: v => `/connected-vehicle/v2/vehicles/${v}/tyres`, accept: JSON_ACCEPT },
	{ name: 'warnings', path: v => `/connected-vehicle/v2/vehicles/${v}/warnings`, accept: JSON_ACCEPT },
	{ name: 'statistics', path: v => `/connected-vehicle/v2/vehicles/${v}/statistics`, accept: JSON_ACCEPT },
	{ name: 'diagnostics', path: v => `/connected-vehicle/v2/vehicles/${v}/diagnostics`, accept: JSON_ACCEPT },
	{ name: 'commands', path: v => `/connected-vehicle/v2/vehicles/${v}/commands`, accept: JSON_ACCEPT },
	{
		name: 'command-accessibility',
		path: v => `/connected-vehicle/v2/vehicles/${v}/command-accessibility`,
		accept: JSON_ACCEPT,
	},
	{ name: 'energy-state', path: v => `/energy/v2/vehicles/${v}/state`, accept: ENERGY_ACCEPT },
	{ name: 'energy-capabilities', path: v => `/energy/v2/vehicles/${v}/capabilities`, accept: ENERGY_ACCEPT },
	{ name: 'location', path: v => `/location/v1/vehicles/${v}/location`, accept: JSON_ACCEPT },
];

const need = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		console.error(`Set ${name} in the environment.`);
		process.exit(1);
	}
	return value;
};

/** Replaces the VIN everywhere and overwrites any coordinates, so nothing identifying is written. */
function anonymise(value: unknown, vin: string): unknown {
	const text = JSON.stringify(value).split(vin).join(TEST_VIN);
	return scrubCoordinates(JSON.parse(text));
}

function scrubCoordinates(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(scrubCoordinates);
	if (node && typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(node)) {
			if (key === 'coordinates' && Array.isArray(val)) out[key] = [TEST_LON, TEST_LAT, ...val.slice(2)];
			else if (key === 'latitude') out[key] = TEST_LAT;
			else if (key === 'longitude') out[key] = TEST_LON;
			else out[key] = scrubCoordinates(val);
		}
		return out;
	}
	return node;
}

async function main() {
	const clientId = need('VOLVO_CLIENT_ID');
	const clientSecret = need('VOLVO_CLIENT_SECRET');
	const apiKey = need('VOLVO_API_KEY');
	const token = await getAccessToken({ clientId, clientSecret });

	const get = async (urlPath: string, accept: string) => {
		const res = await fetch(`${BASE}${urlPath}`, {
			headers: { Authorization: `Bearer ${token}`, 'vcc-api-key': apiKey, Accept: accept },
		});
		const body: unknown = await res.json().catch(() => null);
		return { status: res.status, body };
	};

	mkdirSync(OUT_DIR, { recursive: true });
	const save = (name: string, body: unknown, vin: string) => {
		const clean = anonymise(body, vin) as Record<string, unknown>;
		writeFileSync(
			path.join(OUT_DIR, `${name}.json`),
			`${JSON.stringify({ _source: 'captured', ...clean }, null, '\t')}\n`
		);
	};

	const list = await get(vehiclePaths.vehicles(), JSON_ACCEPT);
	const vin = (list.body as { data?: Array<{ vin?: string }> } | null)?.data?.[0]?.vin;
	if (list.status !== 200 || !vin) {
		console.error(`vehicles list failed (HTTP ${list.status}); nothing written.`);
		process.exit(1);
	}
	save('vehicles', list.body, vin);
	console.log('vehicles: HTTP 200');

	for (const endpoint of endpoints) {
		const { status, body } = await get(endpoint.path(vin), endpoint.accept);
		console.log(`${endpoint.name}: HTTP ${status}`);
		// Keep non-200 bodies too: a 404 for an unsupported capability is worth knowing about.
		save(endpoint.name, body ?? { error: `HTTP ${status}, non-JSON body` }, vin);
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
