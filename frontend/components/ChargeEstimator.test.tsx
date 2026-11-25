import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PriceDay, Tariff } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { ChargeEstimator } from './ChargeEstimator';

const tariff: Tariff = {
	id: 't',
	effectiveFrom: '2026-01-01',
	vatRate: 0.25,
	energyTaxPerKwh: 0.4,
	fortum: { markupPerKwh: 0.1, monthlyFee: 0 },
	nacka: {
		fixedPerYear: 0,
		transferLowPerKwh: 0.2,
		transferHighPerKwh: 0.4,
		peakPerKwMonth: 0,
		highLoad: { months: [], weekdaysOnly: true, fromHour: 6, toHour: 22 },
	},
};
// Cheap 02:00–04:59 local on the 8th, 1 kr otherwise.
const day = (date: string, price: (h: number) => number): PriceDay => ({
	date,
	quarters: Array.from({ length: 96 }, (_, i) => ({
		start: `${date}T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00+01:00`,
		sekPerKwhExVat: price(Math.floor(i / 4)),
	})),
});
const days = {
	'2026-11-07': day('2026-11-07', () => 1),
	'2026-11-08': day('2026-11-08', h => (h >= 2 && h < 5 ? 0.1 : 1)),
};
const NOW = '2026-11-07T16:30:00.000Z'; // 17:30 local

const renderIt = (battery: number | null = 50, onWindow = vi.fn()) => {
	render(
		<ChargeEstimator
			now={NOW}
			batteryPercent={battery}
			settings={DEFAULT_SETTINGS}
			days={days}
			tariffs={[tariff]}
			peaksByMonth={{}}
			onWindow={onWindow}
		/>
	);
	return onWindow;
};

describe('ChargeEstimator', () => {
	it('defaults to the car battery and target, and finds the cheap night hours', () => {
		const onWindow = renderIt();
		expect(screen.getByLabelText('Battery now')).toHaveValue('50');
		expect(screen.getByLabelText('Charge to')).toHaveValue('80');
		const out = screen.getByTestId('estimate');
		// 30% of 75 / 0.9 = 25 kWh; 11 kW needs 3 h, all in the cheap block.
		expect(out).toHaveTextContent('02:00–05:00');
		expect(out).toHaveTextContent('25,0 kWh at 11 kW');
		expect(out).toHaveTextContent(/Saves .* vs plugging in now/);
		expect(onWindow).toHaveBeenLastCalledWith({
			start: '2026-11-08T01:00:00.000Z',
			end: '2026-11-08T04:00:00.000Z',
		});
	});

	it('says when the ready-by time leaves too little time', () => {
		renderIt(0);
		fireEvent.change(screen.getByLabelText('Ready by'), { target: { value: '2026-11-07T18:00:00.000Z' } });
		expect(screen.getByTestId('estimate')).toHaveTextContent('Not enough time');
	});

	it('moves the window when the ready-by time is before the cheap hours', () => {
		renderIt();
		fireEvent.change(screen.getByLabelText('Ready by'), { target: { value: '2026-11-07T22:00:00.000Z' } });
		expect(screen.getByTestId('estimate')).not.toHaveTextContent('02:00–05:00');
		expect(screen.getByTestId('estimate')).toHaveTextContent('Starting right away');
	});

	it('uses the picked plug-in hour as the comparison', () => {
		renderIt();
		fireEvent.change(screen.getByLabelText('Plug in'), { target: { value: '2026-11-07T20:00:00.000Z' } });
		expect(screen.getByTestId('estimate')).toHaveTextContent(/vs starting at 21:00/);
	});

	it('respects a forced power', () => {
		renderIt();
		fireEvent.click(screen.getByRole('button', { name: '3.7 kW' }));
		expect(screen.getByTestId('estimate')).toHaveTextContent('at 3.7 kW');
	});

	it('shows nothing to do at or above target', () => {
		renderIt(90);
		expect(screen.getByTestId('estimate')).toHaveTextContent('Already there');
	});
});
