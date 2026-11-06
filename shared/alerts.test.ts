import { describe, expect, it } from 'vitest';
import type { CarState, IsoUtc } from './types';
import { leftOpenIssues, leftOpenMessage, reconnectDue, shouldSendLeftOpen } from './alerts';

const AT = '2026-11-06T18:00:00.000Z' as IsoUtc;
function car(over: Partial<CarState>): CarState {
	return {
		vinLast4: '0001', battery: null, locked: null, openings: null, tyres: null, warnings: null,
		service: null, odometerKm: null, location: null, trips: null, updatedAt: AT, ...over,
	};
}

describe('leftOpenIssues', () => {
	it('unlocked plus open window, sorted', () => {
		const c = car({
			locked: { value: false, at: AT },
			openings: { value: { 'window:rearLeft': 'open', 'door:frontLeft': 'closed', tailgate: 'closed' }, at: AT },
		});
		expect(leftOpenIssues(c)).toEqual(['unlocked', 'window:rearLeft']);
	});
	it('empty when locked and closed or unknown', () => {
		expect(leftOpenIssues(car({ locked: { value: true, at: AT } }))).toEqual([]);
		expect(leftOpenIssues(car({}))).toEqual([]);
	});
	it('sorts openings alphabetically', () => {
		const c = car({ openings: { value: { tailgate: 'open', 'door:rearLeft': 'open' }, at: AT } });
		expect(leftOpenIssues(c)).toEqual(['door:rearLeft', 'tailgate']);
	});
});

describe('shouldSendLeftOpen', () => {
	const issues = ['unlocked', 'window:rearLeft'];
	// Nov: Stockholm is UTC+1
	const night = '2026-11-06T22:00:00Z' as IsoUtc; // 23:00 local
	const day = '2026-11-06T14:00:00Z' as IsoUtc; // 15:00 local
	it('sends at night for new issues, then not again', () => {
		const first = shouldSendLeftOpen(issues, night, null);
		expect(first).toEqual({ send: true, key: 'unlocked,window:rearLeft' });
		expect(shouldSendLeftOpen(issues, night, first.key)).toEqual({ send: false, key: 'unlocked,window:rearLeft' });
	});
	it('does not send in daytime and keeps lastKey', () => {
		expect(shouldSendLeftOpen(issues, day, null)).toEqual({ send: false, key: null });
		expect(shouldSendLeftOpen(issues, day, 'x')).toEqual({ send: false, key: 'x' });
	});
	it('window boundaries 22:00 and 06:00 local', () => {
		expect(shouldSendLeftOpen(issues, '2026-11-06T21:00:00Z' as IsoUtc, null).send).toBe(true);
		expect(shouldSendLeftOpen(issues, '2026-11-06T20:59:00Z' as IsoUtc, null).send).toBe(false);
		expect(shouldSendLeftOpen(issues, '2026-11-07T04:59:00Z' as IsoUtc, null).send).toBe(true);
		expect(shouldSendLeftOpen(issues, '2026-11-07T05:00:00Z' as IsoUtc, null).send).toBe(false);
	});
	it('empty issues reset key to null', () => {
		expect(shouldSendLeftOpen([], night, 'unlocked')).toEqual({ send: false, key: null });
		expect(shouldSendLeftOpen([], day, 'unlocked')).toEqual({ send: false, key: null });
	});
	it('changed issues notify again', () => {
		expect(shouldSendLeftOpen(['unlocked'], night, 'unlocked,window:rearLeft').send).toBe(true);
	});
});

describe('reconnectDue', () => {
	const start = '2026-11-06T00:00:00Z' as IsoUtc;
	it('true from start + 3 months - 7 days', () => {
		expect(reconnectDue(start, '2027-01-30T00:00:00Z' as IsoUtc)).toBe(true);
		expect(reconnectDue(start, '2027-01-29T00:00:00Z' as IsoUtc)).toBe(false);
	});
	it('clamps month overflow', () => {
		// 2026-11-30 + 3 months -> 2027-02-28
		expect(reconnectDue('2026-11-30T00:00:00Z' as IsoUtc, '2027-02-21T00:00:00Z' as IsoUtc)).toBe(true);
		expect(reconnectDue('2026-11-30T00:00:00Z' as IsoUtc, '2027-02-20T23:00:00Z' as IsoUtc)).toBe(false);
	});
});

describe('leftOpenMessage', () => {
	it('uses human labels', () => {
		expect(leftOpenMessage(['unlocked', 'window:rearLeft'])).toBe('XC40 is unlocked · rear left window open');
		expect(leftOpenMessage(['door:frontRight', 'tailgate', 'sunroof', 'hood'])).toBe(
			'XC40: front right door open · tailgate open · sunroof open · hood open',
		);
		expect(leftOpenMessage(['unlocked'])).toBe('XC40 is unlocked');
	});
});
