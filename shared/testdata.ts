import type { Tariff } from './types';

// Test fixture only, not the owner's real tariff.
export const TEST_TARIFF: Tariff = {
	id: 't1',
	effectiveFrom: '2026-01-01',
	vatRate: 0.25,
	energyTaxPerKwh: 0.36,
	fortum: { markupPerKwh: 0.05, monthlyFee: 39.2 },
	nacka: {
		fixedPerYear: 2644.8,
		transferLowPerKwh: 0.0736,
		transferHighPerKwh: 0.2944,
		peakPerKwMonth: 45.216,
		highLoad: { months: [1, 2, 3, 11, 12], weekdaysOnly: true, fromHour: 6, toHour: 22 },
	},
};
