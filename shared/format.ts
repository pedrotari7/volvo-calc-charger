import type { IsoUtc } from './types';

const num = (n: number, decimals: number): string => {
	const s = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(n);
	return s.replace(/[  ]/g, ' ').replace(/[−‒-—]/g, '-');
};

export const formatKr = (n: number): string => `${num(n, 2)} kr`;
export const formatKwh = (n: number): string => `${num(n, 1)} kWh`;

export function formatAgo(iso: IsoUtc, now: IsoUtc): string {
	const sec = Math.floor((Date.parse(now) - Date.parse(iso)) / 1000);
	if (sec < 60) return 'just now';
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} min ago`;
	const h = Math.floor(min / 60);
	if (h < 24) return `${h} h ago`;
	return `${Math.floor(h / 24)} d ago`;
}
