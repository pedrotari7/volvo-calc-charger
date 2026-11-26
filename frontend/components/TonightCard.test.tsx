import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Plan, PlanCandidate } from '@shared/types';
import { TonightCard } from './TonightCard';

const cand = (kw: number, cost: number): PlanCandidate => ({
	kw,
	start: '2026-11-07T00:00:00.000Z',
	end: '2026-11-07T03:00:00.000Z',
	energyCost: cost,
	peakIncrease: 0,
	cost,
});
const plan = (over: Partial<Plan> = {}): Plan => ({
	date: '2026-11-06',
	batteryPercent: 40,
	neededKwh: 20,
	basis: 'tomorrow',
	chargeNow: false,
	recommendation: cand(3.7, 18.4),
	alternative: cand(11, 63.4),
	...over,
});

describe('TonightCard', () => {
	it('shows the local window, cost and saving tip', () => {
		render(<TonightCard plan={plan()} />);
		expect(screen.getByText('01:00–04:00')).toBeInTheDocument();
		expect(screen.getByText(/18,40 kr/)).toBeInTheDocument();
		expect(
			screen.getByText(/Charging at 3.7 kW instead of 11 kW keeps this month’s peak fee lower/)
		).toBeInTheDocument();
		expect(screen.queryByText(/tomorrow not out yet/i)).toBeNull();
	});

	it('draws the window on the night, from 18:00 to ready-by', () => {
		render(<TonightCard plan={plan()} now='2026-11-06T19:00:00.000Z' readyBy='07:00' />);
		expect(
			screen.getByRole('img', { name: 'Charging 01:00 to 04:00, between 18:00 and 07:00' })
		).toBeInTheDocument();
	});

	it('shows the energy cost only, leaving the peak fee to the month', () => {
		const rec = { ...cand(11, 30), energyCost: 20, peakIncrease: 10 };
		render(<TonightCard plan={plan({ recommendation: rec, alternative: null })} />);
		expect(screen.getByText('20,0 kWh at 11 kW · 20,00 kr')).toBeInTheDocument();
		expect(screen.queryByText(/peak/)).toBeNull();
	});

	it('at full power, the saving tip counts energy only', () => {
		const rec = { ...cand(11, 25), energyCost: 15, peakIncrease: 10 };
		const alt = { ...cand(3.7, 30), energyCost: 30 };
		render(<TonightCard plan={plan({ recommendation: rec, alternative: alt })} />);
		expect(screen.getByText(/Charging at 11 kW instead of 3.7 kW saves 15,00 kr/)).toBeInTheDocument();
	});

	it('omits the tip when the alternative is not dearer', () => {
		render(<TonightCard plan={plan({ alternative: cand(11, 18.4) })} />);
		expect(screen.queryByText(/saves/)).toBeNull();
	});

	it('notes missing tomorrow prices for basis today', () => {
		render(<TonightCard plan={plan({ basis: 'today' })} />);
		expect(screen.getByText('01:00–04:00')).toBeInTheDocument();
		expect(screen.getByText(/prices for tomorrow not out yet/i)).toBeInTheDocument();
	});

	it('handles no recommendation, charge now and already at target', () => {
		const { rerender } = render(<TonightCard plan={plan({ recommendation: null, alternative: null })} />);
		expect(screen.getByText(/prices for tomorrow not out yet/i)).toBeInTheDocument();
		rerender(<TonightCard plan={plan({ recommendation: null, chargeNow: true })} />);
		expect(screen.getByText(/Plug in now — not enough time to wait for cheap hours/)).toBeInTheDocument();
		rerender(<TonightCard plan={plan({ neededKwh: 0, recommendation: null })} />);
		expect(screen.getByText('Already at target')).toBeInTheDocument();
	});
});
