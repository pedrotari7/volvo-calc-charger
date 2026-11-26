import { DEFAULT_SETTINGS, withDefaultSettings } from './types';

describe('DEFAULT_SETTINGS', () => {
	it('matches the spec values', () => {
		expect(DEFAULT_SETTINGS).toEqual({
			targetPercent: 80,
			readyBy: '07:00',
			usableBatteryKwh: 75,
			chargingEfficiency: 0.9,
			chargerMaxKw: 11,
			reducedKw: 3.7,
			petrol: { litresPer100km: 7.5, krPerLitre: 18 },
			notifications: { plugIn: true, sessionDone: true, leftOpen: true },
		});
	});
});

describe('withDefaultSettings', () => {
	it('fills nested groups field by field', () => {
		const s = withDefaultSettings({ targetPercent: 90, petrol: { krPerLitre: 20 } as never });
		expect(s.targetPercent).toBe(90);
		expect(s.petrol).toEqual({ litresPer100km: 7.5, krPerLitre: 20 });
		expect(s.notifications).toEqual(DEFAULT_SETTINGS.notifications);
		expect(withDefaultSettings(null)).toEqual(DEFAULT_SETTINGS);
	});
});
