import { describe, expect, it } from 'vitest';
import { formatDay, formatLocalTime, formatMonth } from './localTime';

describe('localTime', () => {
	it('formats local times, days and months in Stockholm', () => {
		expect(formatLocalTime('2026-11-02T23:02:05.000Z')).toBe('00:02');
		expect(formatDay('2026-11-02T23:02:05.000Z')).toBe('Tue 3 Nov');
		expect(formatMonth('2026-11')).toBe('November 2026');
	});
});
