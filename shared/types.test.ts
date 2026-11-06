import { DEFAULT_SETTINGS } from './types';

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
