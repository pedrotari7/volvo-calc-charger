import { describe, expect, it } from 'vitest';
import type { IsoUtc } from './types';
import { parseCarState } from './volvo';
import vehicles from '../backend/test/fixtures/volvo/vehicles.json';
import doors from '../backend/test/fixtures/volvo/doors.json';
import windows from '../backend/test/fixtures/volvo/windows.json';
import odometer from '../backend/test/fixtures/volvo/odometer.json';
import tyres from '../backend/test/fixtures/volvo/tyres.json';
import warnings from '../backend/test/fixtures/volvo/warnings.json';
import energy from '../backend/test/fixtures/volvo/energy-state.json';
import location from '../backend/test/fixtures/volvo/location.json';
import diagnostics from '../backend/test/fixtures/volvo/diagnostics.json';
import statistics from '../backend/test/fixtures/volvo/statistics.json';

const NOW = '2026-11-06T19:00:00.000Z' as IsoUtc;
const AT = '2026-11-06T18:00:00.000Z';
const all = { vehicles, doors, windows, odometer, tyres, warnings, energy, location, diagnostics, statistics };

describe('parseCarState', () => {
	it('parses every section of the fixtures', () => {
		const c = parseCarState(all, NOW);
		expect(c.vinLast4).toBe('0001');
		expect(JSON.stringify(c)).not.toContain('YV1TESTVIN');
		expect(c.battery).toEqual({
			value: { percent: 62, rangeKm: 231, chargingStatus: 'IDLE', estFullAt: null },
			at: AT,
		});
		expect(c.locked).toEqual({ value: false, at: AT });
		expect(c.openings?.value).toEqual({
			'door:frontLeft': 'closed',
			'door:frontRight': 'closed',
			'door:rearLeft': 'closed',
			'door:rearRight': 'closed',
			'window:frontLeft': 'closed',
			'window:frontRight': 'closed',
			'window:rearLeft': 'open',
			'window:rearRight': 'closed',
			tailgate: 'closed',
			hood: 'closed',
			sunroof: 'closed',
		});
		expect(c.odometerKm).toEqual({ value: 23456, at: AT });
		expect(c.tyres?.value.frontLeft).toBe('NO_WARNING');
		expect(c.warnings).toEqual({ value: [], at: AT });
		expect(c.service?.value).toEqual({ status: 'NO_WARNING', distanceKm: 14200, days: 330 });
		expect(c.location).toEqual({ value: { lat: 59.31, lng: 18.16 }, at: AT });
		expect(c.trips?.value.averageEnergyConsumption).toBe(19.4);
		expect(c.trips?.value.distanceToEmptyBattery).toBe(231);
		expect(c.updatedAt).toBe(NOW);
	});

	it('doors missing: locked and door openings null, battery present, windows kept', () => {
		const c = parseCarState({ ...all, doors: undefined }, NOW);
		expect(c.locked).toBeNull();
		expect(c.battery).not.toBeNull();
		expect(Object.keys(c.openings?.value ?? {}).some(k => k.startsWith('door:'))).toBe(false);
		expect(c.openings?.value['window:rearLeft']).toBe('open');
	});

	it('doors and windows both missing: openings null', () => {
		const c = parseCarState({ vehicles, energy }, NOW);
		expect(c.openings).toBeNull();
		expect(c.locked).toBeNull();
		expect(c.odometerKm).toBeNull();
	});

	it('malformed section yields null without throwing', () => {
		const c = parseCarState(
			{ ...all, energy: 'junk', odometer: { data: { odometer: { value: 'x' } } }, location: {} },
			NOW
		);
		expect(c.battery).toBeNull();
		expect(c.odometerKm).toBeNull();
		expect(c.location).toBeNull();
		expect(c.locked).not.toBeNull();
	});

	it('throws when vehicles is missing or invalid', () => {
		expect(() => parseCarState({ vehicles: null }, NOW)).toThrow();
		expect(() => parseCarState({ vehicles: { data: [] } }, NOW)).toThrow();
	});

	it('at is the newest timestamp used; falls back to now', () => {
		const d = {
			data: {
				centralLock: { value: 'LOCKED', timestamp: '2026-11-06T10:00:00.000Z' },
				hood: { value: 'AJAR', timestamp: '2026-11-06T12:00:00.000Z' },
				tailgate: { value: 'WEIRD', timestamp: '2026-11-06T15:00:00.000Z' },
			},
		};
		const c = parseCarState({ vehicles, doors: d }, NOW);
		expect(c.locked).toEqual({ value: true, at: '2026-11-06T10:00:00.000Z' });
		expect(c.openings?.value).toEqual({ hood: 'open' });
		expect(c.openings?.at).toBe('2026-11-06T12:00:00.000Z');
		const n = parseCarState({ vehicles, doors: { data: { centralLock: { value: 'LOCKED' } } } }, NOW);
		expect(n.locked).toEqual({ value: true, at: NOW });
	});

	it('estFullAt is set while charging', () => {
		const e = JSON.parse(JSON.stringify(energy));
		e.data.chargingStatus.value = 'CHARGING';
		e.data.estimatedChargingTimeToTargetBatteryChargeLevel.value = 90;
		const c = parseCarState({ vehicles, energy: e }, NOW);
		expect(c.battery?.value.estFullAt).toBe('2026-11-06T19:30:00.000Z');
	});

	it('missing electricRange gives rangeKm null, not 0', () => {
		const e = JSON.parse(JSON.stringify(energy));
		delete e.data.electricRange;
		const c = parseCarState({ vehicles, energy: e }, NOW);
		expect(c.battery?.value.percent).toBe(62);
		expect(c.battery?.value.rangeKm).toBeNull();
	});

	it('lists non-OK warnings', () => {
		const w = JSON.parse(JSON.stringify(warnings));
		w.data.brakeLightLeftWarning.value = 'FAILURE';
		const c = parseCarState({ vehicles, warnings: w }, NOW);
		expect(c.warnings?.value).toEqual(['brakeLightLeftWarning']);
	});
});
