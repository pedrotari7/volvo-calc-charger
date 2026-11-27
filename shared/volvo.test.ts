import { describe, expect, it } from 'vitest';
import type { IsoUtc } from './types';
import { carImageViews, parseCarProfile, parseCarState, parseSupportedCommands, tuneCarImageUrl } from './volvo';
import commands from '../backend/test/fixtures/volvo/commands.json';
import accessibility from '../backend/test/fixtures/volvo/command-accessibility.json';
import details from '../backend/test/fixtures/volvo/details.json';
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
		e.chargingStatus.value = 'CHARGING';
		e.estimatedChargingTimeToTargetBatteryChargeLevel.value = 90;
		const c = parseCarState({ vehicles, energy: e }, NOW);
		expect(c.battery?.value.estFullAt).toBe('2026-11-06T19:30:00.000Z');
	});

	it('estFullAt counts from the minutes reading, not a newer reading of another field', () => {
		const e = JSON.parse(JSON.stringify(energy));
		e.chargingStatus.value = 'CHARGING';
		e.chargingStatus.updatedAt = '2026-11-06T18:40:00.000Z';
		e.estimatedChargingTimeToTargetBatteryChargeLevel.value = 90;
		const c = parseCarState({ vehicles, energy: e }, NOW);
		expect(c.battery?.value.estFullAt).toBe('2026-11-06T19:30:00.000Z');
	});

	it('also reads energy fields wrapped in data (Energy v1 shape)', () => {
		const { _source, _note, ...fields } = JSON.parse(JSON.stringify(energy));
		const c = parseCarState({ vehicles, energy: { _source, _note, data: fields } }, NOW);
		expect(c.battery?.value).toEqual({ percent: 62, rangeKm: 231, chargingStatus: 'IDLE', estFullAt: null });
		expect(c.battery?.at).toBe('2026-11-06T18:00:00.000Z');
	});

	it('an errored battery field (no value) gives battery null', () => {
		const c = parseCarState(
			{ vehicles, energy: { batteryChargeLevel: { status: 'ERROR', code: 'NOT_SUPPORTED', message: 'x' } } },
			NOW
		);
		expect(c.battery).toBeNull();
	});

	it('missing electricRange gives rangeKm null, not 0', () => {
		const e = JSON.parse(JSON.stringify(energy));
		delete e.electricRange;
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

describe('parseCarProfile', () => {
	it('reads model, year, paint and picture from vehicle details', () => {
		expect(parseCarProfile(details, NOW)).toMatchObject({
			model: 'XC40',
			modelYear: 2023,
			colour: 'Fjord Blue',
			imageUrl: 'https://example.invalid/exterior.png',
			commands: null,
			fetchedAt: NOW,
		});
	});

	it('lists every render angle and the interior, and the supported commands', () => {
		const p = parseCarProfile(details, NOW, commands);
		expect(p?.views?.map(v => v.view)).toEqual([
			'front_left',
			'front',
			'front_right',
			'side_right',
			'back_right',
			'back',
			'back_left',
			'side_left',
			'interior',
		]);
		expect(p?.views?.[0].url).toBe('https://example.invalid/exterior.png?angle=4');
		expect(p?.views?.at(-1)?.url).toBe('https://example.invalid/interior.png');
		expect(p?.commands).toEqual(['LOCK', 'LOCK_REDUCED_GUARD', 'CLIMATIZATION_START', 'CLIMATIZATION_STOP']);
	});

	it('drops a picture that is not https, and returns null when nothing is known', () => {
		const p = parseCarProfile(
			{ data: { externalColour: 'Vapour Grey', images: { exteriorImageUrl: 'http://x/a.png' } } },
			NOW
		);
		expect(p?.colour).toBe('Vapour Grey');
		expect(p?.imageUrl).toBeNull();
		expect(parseCarProfile({ data: {} }, NOW)).toBeNull();
		expect(parseCarProfile(undefined, NOW)).toBeNull();
	});
});

describe('carImageViews', () => {
	it('replaces the angle parameter and keeps the transparent background', () => {
		const v = carImageViews('https://cas.example/img.png?angle=1&bg=ffffff&w=1920', null);
		expect(v.find(x => x.view === 'back')?.url).toBe('https://cas.example/img.png?angle=6&bg=00000000&w=1000');
		expect(v).toHaveLength(8);
	});

	it('names the angle in the path on the wizz host, skipping angles it does not have', () => {
		const v = carImageViews('https://wizz.example/car/abc/right/image.png', 'https://wizz.example/in.png');
		expect(v.map(x => x.view)).toEqual([
			'front_left',
			'front',
			'side_right',
			'back',
			'back_left',
			'side_left',
			'interior',
		]);
		expect(v.find(x => x.view === 'back')?.url).toBe('https://wizz.example/car/abc/rear/image.png');
	});

	it('returns nothing for missing or non-https pictures', () => {
		expect(carImageViews(null, null)).toEqual([]);
		expect(carImageViews('http://x/a.png', 'http://x/b.png')).toEqual([]);
	});
});

describe('parseSupportedCommands', () => {
	it('returns the command keys, or null when there is no list', () => {
		expect(parseSupportedCommands({ data: [{ command: 'HONK' }, { command: 'HONK' }, {}] })).toEqual(['HONK']);
		expect(parseSupportedCommands(undefined)).toBeNull();
	});
});

describe('command accessibility', () => {
	it('reads whether the car takes commands, with the reason when it does not', () => {
		expect(parseCarState({ vehicles, accessibility }, NOW).access).toEqual({
			value: { available: true, reason: null },
			at: AT,
		});
		const off = {
			data: { availabilityStatus: { value: 'UNAVAILABLE', unavailableReason: 'CAR_IN_SLEEP_MODE' } },
		};
		expect(parseCarState({ vehicles, accessibility: off }, NOW).access?.value).toEqual({
			available: false,
			reason: 'CAR_IN_SLEEP_MODE',
		});
		expect(parseCarState({ vehicles }, NOW).access).toBeNull();
	});
});

describe('tuneCarImageUrl', () => {
	it('asks for a transparent, phone-sized render only when the URL already has those parameters', () => {
		expect(tuneCarImageUrl('https://cas.example/img.png?angle=1&bg=ffffff&w=1920')).toBe(
			'https://cas.example/img.png?angle=1&bg=00000000&w=1000'
		);
		expect(tuneCarImageUrl('https://cas.example/img.png')).toBe('https://cas.example/img.png');
		expect(tuneCarImageUrl('not a url')).toBeNull();
	});
});
