import { logger } from 'firebase-functions/v2';
import type { ChargerState } from '../../../shared/types';

export type FetchFn = typeof fetch;

export const ZAPTEC_BASE = 'https://api.zaptec.com';
export const ZAPTEC_TOKEN_URL = `${ZAPTEC_BASE}/oauth/token`;

// Observation ids from Zaptec's documentation (see docs/owner-actions.md to verify).
export const STATE_OPERATION_MODE = 710; // 1 disconnected, 2 connected, 3 charging, 5 finished
export const STATE_TOTAL_POWER_W = 513;
export const STATE_SESSION_KWH = 553;

const REFRESH_MARGIN_MS = 5 * 60_000;

export class ZaptecHttpError extends Error {
	constructor(
		readonly status: number,
		what: string
	) {
		super(`zaptec: ${what} HTTP ${status}`);
	}
}

export interface ZaptecClient {
	history(pageSize?: number): Promise<unknown>;
	chargerState(): Promise<ChargerState>;
}

interface Observation {
	StateId: number;
	ValueAsString: string;
}

export function mapChargerState(obs: Observation[], updatedAt: string): ChargerState {
	const value = (id: number): number => {
		const o = obs.find(x => Number(x.StateId) === id);
		const n = o ? Number(o.ValueAsString) : NaN;
		return Number.isFinite(n) ? n : 0;
	};
	if (!obs.some(x => Number(x.StateId) === STATE_OPERATION_MODE)) {
		logger.warn(`zaptec: state has no observation ${STATE_OPERATION_MODE} (ChargerOperationMode)`);
	}
	const mode = value(STATE_OPERATION_MODE);
	return {
		pluggedIn: mode === 2 || mode === 3 || mode === 5,
		charging: mode === 3,
		liveKw: Math.round(value(STATE_TOTAL_POWER_W)) / 1000,
		sessionKwh: value(STATE_SESSION_KWH),
		updatedAt,
	};
}

export function createZaptecClient(
	creds: { username: string; password: string },
	fetchFn: FetchFn = fetch
): ZaptecClient {
	let cached: { token: string; refreshAtMs: number } | null = null;

	async function token(): Promise<string> {
		if (cached && Date.now() < cached.refreshAtMs) return cached.token;
		const res = await fetchFn(ZAPTEC_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'password', username: creds.username, password: creds.password }),
		});
		if (!res.ok) throw new ZaptecHttpError(res.status, 'token');
		const body = (await res.json()) as { access_token: string; expires_in: number };
		cached = { token: body.access_token, refreshAtMs: Date.now() + body.expires_in * 1000 - REFRESH_MARGIN_MS };
		return body.access_token;
	}

	async function get(path: string): Promise<unknown> {
		const res = await fetchFn(`${ZAPTEC_BASE}${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
		if (!res.ok) throw new ZaptecHttpError(res.status, path.split('?')[0].replace(/[0-9a-f-]{36}/g, ':id'));
		return res.json();
	}

	return {
		history: pageSize => get(`/api/chargehistory?DetailLevel=1&PageSize=${pageSize ?? 20}&SortDescending=true`),
		async chargerState() {
			const chargers = (await get('/api/chargers')) as { Data?: { Id: string }[] };
			const id = chargers.Data?.[0]?.Id;
			if (!id) throw new Error('zaptec: no charger on account');
			const obs = (await get(`/api/chargers/${id}/state`)) as Observation[];
			return mapChargerState(obs, new Date().toISOString());
		},
	};
}
