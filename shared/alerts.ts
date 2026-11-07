import { localParts } from './time';
import type { CarState, IsoUtc } from './types';

const CAR_NAME = 'XC40';
const DAY_MS = 86_400_000;

export function leftOpenIssues(car: CarState): string[] {
	const issues: string[] = [];
	if (car.locked?.value === false) issues.push('unlocked');
	for (const [key, v] of Object.entries(car.openings?.value ?? {})) {
		if (v === 'open') issues.push(key);
	}
	return issues.sort();
}

export function shouldSendLeftOpen(
	issues: string[],
	nowUtc: IsoUtc,
	lastKey: string | null
): { send: boolean; key: string | null } {
	if (issues.length === 0) return { send: false, key: null };
	const { hour } = localParts(nowUtc);
	const night = hour >= 22 || hour < 6;
	const key = issues.join(',');
	if (night && key !== lastKey) return { send: true, key };
	return { send: false, key: lastKey };
}

export function reconnectDue(grantStartedAt: IsoUtc, nowUtc: IsoUtc): boolean {
	const s = new Date(grantStartedAt);
	const target = new Date(s.getTime());
	target.setUTCDate(1);
	target.setUTCMonth(s.getUTCMonth() + 3);
	const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	target.setUTCDate(Math.min(s.getUTCDate(), lastDay));
	return Date.parse(nowUtc) >= target.getTime() - 7 * DAY_MS;
}

const POSITIONS: Record<string, string> = {
	frontLeft: 'front left',
	frontRight: 'front right',
	rearLeft: 'rear left',
	rearRight: 'rear right',
};

function label(issue: string): string {
	const [kind, pos] = issue.split(':');
	const p = pos ? (POSITIONS[pos] ?? pos) : '';
	if (kind === 'door') return `${p} door open`;
	if (kind === 'window') return `${p} window open`;
	return `${kind} open`;
}

/** Callers pass non-empty issues; an empty list yields ''. */
export function leftOpenMessage(issues: string[]): string {
	if (issues.length === 0) return '';
	const unlocked = issues.includes('unlocked');
	const rest = issues.filter(i => i !== 'unlocked').map(label);
	if (unlocked) return [`${CAR_NAME} is unlocked`, ...rest].join(' · ');
	return `${CAR_NAME}: ${rest.join(' · ')}`;
}
