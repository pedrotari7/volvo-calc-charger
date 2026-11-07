import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseZaptecSessions, parseZaptecSessionsSafe, parseZaptecTime } from './zaptec';

const fixture = (): unknown =>
	JSON.parse(readFileSync(new URL('../backend/test/fixtures/zaptec/chargehistory.json', import.meta.url), 'utf8'));

describe('parseZaptecTime', () => {
	it('appends Z when there is no offset', () => {
		expect(parseZaptecTime('2026-11-02T23:02:05.187')).toBe('2026-11-02T23:02:05.187Z');
	});
	it('normalises +00:00 to Z', () => {
		expect(parseZaptecTime('2026-11-02T23:02:04.856+00:00')).toBe('2026-11-02T23:02:04.856Z');
	});
});

describe('parseZaptecTime errors', () => {
	it('throws on an invalid timestamp', () => {
		expect(() => parseZaptecTime('nope')).toThrow();
	});
});

describe('parseZaptecSessions', () => {
	it('throws when the page has no Data array', () => {
		expect(() => parseZaptecSessions({})).toThrow();
		expect(() => parseZaptecSessions(null)).toThrow();
	});
	it('tolerates junk entries, missing details and zero-length intervals', () => {
		const base = { StartDateTime: '2026-11-04T20:10:00', EndDateTime: '2026-11-04T20:10:00' };
		const page = {
			Data: [
				'junk',
				{ Id: 'a', ...base, Energy: 1 },
				{
					Id: 'b',
					...base,
					Energy: 1,
					EnergyDetails: ['junk', { Timestamp: '2026-11-04T20:10:00', Energy: 1 }],
				},
			],
		};
		const out = parseZaptecSessions(page);
		expect(out.map((s) => s.hours)).toEqual([[], [{ hourStartUtc: '2026-11-04T20:00:00.000Z', kWh: 1 }]]);
	});
	it('drops the 0 kWh session and parses the first one', () => {
		const sessions = parseZaptecSessions(fixture());
		expect(sessions).toHaveLength(4);
		expect(sessions[0]).toEqual({
			id: '5e1f0c7a-3b92-4d6e-a8f4-1c7d92b0e3a5',
			startUtc: '2026-11-02T23:02:05.187Z',
			endUtc: '2026-11-03T08:30:39.310Z',
			kWh: 11.941,
			hours: [
				{ hourStartUtc: '2026-11-02T23:00:00.000Z', kWh: 9.93 },
				{ hourStartUtc: '2026-11-03T00:00:00.000Z', kWh: 2.011 },
			],
		});
	});
	it('spreads sparse details evenly across hours', () => {
		const page = {
			Data: [
				{
					Id: 'sparse',
					StartDateTime: '2026-11-04T20:00:00',
					EndDateTime: '2026-11-04T23:00:00',
					Energy: 30,
					EnergyDetails: [
						{ Timestamp: '2026-11-04T20:00:00+00:00', Energy: 0 },
						{ Timestamp: '2026-11-04T23:00:00+00:00', Energy: 30 },
					],
				},
			],
		};
		const [s] = parseZaptecSessions(page);
		expect(s.hours).toEqual([
			{ hourStartUtc: '2026-11-04T20:00:00.000Z', kWh: 10 },
			{ hourStartUtc: '2026-11-04T21:00:00.000Z', kWh: 10 },
			{ hourStartUtc: '2026-11-04T22:00:00.000Z', kWh: 10 },
		]);
	});
	it('accepts camelCase keys', () => {
		const page = {
			data: [
				{
					id: 'c',
					startDateTime: '2026-11-04T20:00:00',
					endDateTime: '2026-11-04T21:00:00',
					energy: 2,
					energyDetails: [{ timestamp: '2026-11-04T21:00:00', energy: 2 }],
				},
			],
		};
		expect(parseZaptecSessions(page)[0].hours).toEqual([{ hourStartUtc: '2026-11-04T20:00:00.000Z', kWh: 2 }]);
	});
	it('never exposes personal fields', () => {
		const json = JSON.stringify(parseZaptecSessions(fixture()));
		for (const k of ['userEmail', 'userFullName', 'userUserName', 'deviceName']) {
			expect(json.toLowerCase()).not.toContain(k.toLowerCase());
		}
	});
	it('keeps hours distinct and summing to the total across the DST night', () => {
		const s = parseZaptecSessions(fixture()).find((x) => x.kWh === 42.104)!;
		const sum = s.hours.reduce((a, h) => a + h.kWh, 0);
		expect(Math.abs(sum - 42.104)).toBeLessThan(0.003);
		expect(new Set(s.hours.map((h) => h.hourStartUtc)).size).toBe(s.hours.length);
	});
});

describe('parseZaptecSessionsSafe', () => {
	const good = { Id: 'g', StartDateTime: '2026-11-02T23:02:05', EndDateTime: '2026-11-03T01:00:00', Energy: 2, EnergyDetails: [] };
	it('skips a malformed row and keeps the rest', () => {
		const bad = { ...good, Id: 'b', StartDateTime: 'not a date' };
		const r = parseZaptecSessionsSafe({ Data: [bad, good, 'junk'] });
		expect(r.sessions.map(s => s.id)).toEqual(['g']);
		expect(r.skipped).toBe(1);
	});
	it('reports nothing skipped for a clean page, and zero-energy rows are not counted as skipped', () => {
		const r = parseZaptecSessionsSafe({ Data: [good, { ...good, Id: 'z', Energy: 0 }] });
		expect(r).toMatchObject({ skipped: 0 });
		expect(r.sessions).toHaveLength(1);
	});
	it('still throws when the page has no Data array', () => {
		expect(() => parseZaptecSessionsSafe({ nope: true })).toThrow();
	});
});
