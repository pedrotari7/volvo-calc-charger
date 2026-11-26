import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CarState, ChargerState } from '@shared/types';
import { CarSummary } from './CarSummary';

const NOW = '2026-11-07T12:00:00.000Z';
const car = (rangeKm: number | null): CarState =>
	({
		vinLast4: '1234',
		battery: {
			value: { percent: 55, rangeKm, chargingStatus: 'CHARGING', estFullAt: '2026-11-07T15:30:00.000Z' },
			at: NOW,
		},
		locked: { value: true, at: NOW },
		updatedAt: '2026-11-07T11:50:00.000Z',
	}) as CarState;
const charger: ChargerState = { pluggedIn: true, charging: true, liveKw: 10.9, sessionKwh: 4, updatedAt: NOW };

describe('CarSummary', () => {
	it('shows live charging info with an honest cost estimate', () => {
		render(<CarSummary car={car(null)} charger={charger} now={NOW} rateNow={1.5} />);
		expect(screen.getByText('55 %')).toBeInTheDocument();
		expect(screen.getByText(/Range –/)).toBeInTheDocument();
		expect(screen.getByText(/Charging/)).toBeInTheDocument();
		const live = screen.getByText(/10.9 kW/);
		expect(live).toHaveTextContent('4,0 kWh');
		expect(live).toHaveTextContent("≈ 6,00 kr so far (at the current hour's price)");
		expect(live).toHaveTextContent('full 16:30');
		expect(screen.getByText('Updated 10 min ago')).toBeInTheDocument();
	});

	it('shows a range when known and hides live info when not charging', () => {
		render(<CarSummary car={car(310)} charger={{ ...charger, charging: false }} now={NOW} rateNow={null} />);
		expect(screen.getByText(/Range 310 km/)).toBeInTheDocument();
		expect(screen.getByText('Plugged in')).toBeInTheDocument();
		expect(screen.queryByText(/so far/)).toBeNull();
	});

	it('says the car is ready once the battery reaches the target', () => {
		render(
			<CarSummary car={car(310)} charger={{ ...charger, charging: false }} now={NOW} rateNow={null} target={50} />
		);
		expect(screen.getByText('Ready to roll')).toBeInTheDocument();
		expect(screen.queryByText('Plugged in')).toBeNull();
	});

	it("shows Volvo's picture of the car with its model and paint, and drops a picture that fails", () => {
		const profile = {
			model: 'XC40',
			modelYear: 2023,
			colour: 'Vapour Grey',
			imageUrl: 'https://cas.example/xc40.png',
			fetchedAt: NOW,
		};
		render(<CarSummary car={car(310)} charger={charger} now={NOW} rateNow={null} profile={profile} />);
		expect(screen.getByText('Volvo XC40')).toBeInTheDocument();
		expect(screen.getByText('Vapour Grey · 2023')).toBeInTheDocument();
		const img = screen.getByRole('img', { name: 'Volvo XC40' });
		expect(img).toHaveAttribute('src', 'https://cas.example/xc40.png');
		fireEvent.error(img);
		expect(screen.queryByRole('img', { name: 'Volvo XC40' })).toBeNull();
		expect(screen.getByText('Volvo XC40')).toBeInTheDocument();
	});
});
