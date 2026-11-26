import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarState } from '@shared/types';

const at = '2026-11-07T11:00:00.000Z';
const car: CarState = {
	vinLast4: '1234',
	battery: null,
	locked: null,
	openings: { at, value: { 'door:frontLeft': 'closed', 'window:rearLeft': 'open', tailgate: 'closed' } },
	tyres: null,
	warnings: { at, value: [] },
	service: { at, value: { status: 'OK', distanceKm: 12000, days: 200 } },
	odometerKm: { at, value: 12345 },
	location: { at, value: { lat: 59.31, lng: 18.16 } },
	trips: { at, value: { averageSpeed: 54, tripMeterManual: 1234.5 } },
	updatedAt: at,
};

const useDoc = vi.fn((_p: string): unknown => ({ data: car, loading: false, error: null }));
vi.mock('../../../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));
vi.mock('../../../lib/useNow', () => ({ useNow: () => '2026-11-07T12:00:00.000Z' }));

import CarPage from './page';
import { tileXY } from '../../../lib/osmTile';

beforeEach(() => {
	useDoc.mockReset().mockReturnValue({ data: car, loading: false, error: null });
});

describe('CarPage', () => {
	it('shows opening labels and states', () => {
		render(<CarPage />);
		expect(screen.getByText('Rear left window')).toBeInTheDocument();
		expect(screen.getByText('Front left door')).toBeInTheDocument();
		expect(screen.getByText('Open')).toBeInTheDocument();
		expect(useDoc).toHaveBeenCalledWith('car/state');
	});

	it('sums the car up in tiles that jump to their sections', () => {
		render(<CarPage />);
		const glance = screen.getByRole('group', { name: 'At a glance' });
		const tile = (name: RegExp) => within(glance).getByRole('link', { name });
		expect(tile(/1 open/)).toHaveAttribute('href', '#openings');
		expect(tile(/None\s*Warnings/)).toHaveAttribute('href', '#warnings');
		expect(tile(/Unknown\s*Tyres/)).toBeInTheDocument();
		expect(tile(/in 12\s000 km\s*Service/)).toHaveAttribute('href', '#service');
		expect(document.getElementById('openings')).not.toBeNull();
	});

	it('words Volvo status codes and flags the bad ones', () => {
		useDoc.mockReturnValue({
			data: {
				...car,
				tyres: { at, value: { frontLeft: 'NO_WARNING', rearRight: 'VERY_LOW_PRESSURE' } },
				service: { at, value: { status: 'NO_WARNING', distanceKm: null, days: null } },
			},
			loading: false,
			error: null,
		});
		render(<CarPage />);
		expect(screen.getAllByText('OK').length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText('Very low pressure')).toBeInTheDocument();
		expect(screen.queryByText(/NO_WARNING/)).toBeNull();
		expect(within(screen.getByRole('group', { name: 'At a glance' })).getByText('1 to check')).toBeInTheDocument();
	});

	it('shows Not available for a null section', () => {
		render(<CarPage />);
		expect(screen.getByText('Not available')).toBeInTheDocument();
	});

	it('links to Apple Maps and shows the OSM tile with attribution', () => {
		render(<CarPage />);
		expect(screen.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
			'href',
			expect.stringContaining('ll=59.31,18.16')
		);
		expect(screen.getByRole('img')).toHaveAttribute('src', 'https://tile.openstreetmap.org/16/36073/19280.png');
		expect(screen.getByRole('link', { name: '© OpenStreetMap contributors' })).toBeInTheDocument();
	});

	it('formats trips and ages', () => {
		render(<CarPage />);
		expect(screen.getByText('Average speed')).toBeInTheDocument();
		expect(screen.getByText(/^1\s234,5 km$/)).toBeInTheDocument();
		expect(screen.getByText('Trip meter manual')).toBeInTheDocument();
		expect(screen.getAllByText('1 h ago').length).toBeGreaterThan(0);
	});

	it('computes slippy tile coordinates', () => {
		expect(tileXY(0, 0, 1)).toEqual({ x: 1, y: 1 });
		expect(tileXY(59.31, 18.16, 16)).toEqual({ x: 36073, y: 19280 });
	});

	it('shows Not available for empty openings and tyres', () => {
		useDoc.mockReturnValue({
			data: { ...car, openings: { at, value: {} }, tyres: { at, value: {} } },
			loading: false,
			error: null,
		});
		render(<CarPage />);
		expect(screen.getAllByText('Not available')).toHaveLength(2);
	});

	it('shows a loading note and an error note', () => {
		useDoc.mockReturnValue({ data: null, loading: true, error: null });
		const { unmount } = render(<CarPage />);
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		unmount();
		useDoc.mockReturnValue({ data: null, loading: false, error: new Error('x') });
		render(<CarPage />);
		expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the car");
	});
});
