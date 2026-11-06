import { render, screen } from '@testing-library/react';
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

	it('shows Not available for a null section', () => {
		render(<CarPage />);
		expect(screen.getByText('Not available')).toBeInTheDocument();
	});

	it('links to Apple Maps and shows the OSM tile with attribution', () => {
		render(<CarPage />);
		expect(screen.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute('href', expect.stringContaining('ll=59.31,18.16'));
		expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringMatching(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/));
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
