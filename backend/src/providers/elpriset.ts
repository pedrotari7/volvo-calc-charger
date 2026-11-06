import { parseElpriset } from '../../../shared/prices';
import type { PriceDay } from '../../../shared/types';

export type FetchFn = typeof fetch;

export const elprisetUrl = (date: string): string =>
	`https://www.elprisetjustnu.se/api/v1/prices/${date.slice(0, 4)}/${date.slice(5)}_SE3.json`;

/** `null` when the day is not published yet (404). */
export async function fetchPriceDay(date: string, fetchFn: FetchFn = fetch): Promise<PriceDay | null> {
	const res = await fetchFn(elprisetUrl(date));
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`elpriset ${date}: HTTP ${res.status}`);
	return parseElpriset(date, await res.json());
}
