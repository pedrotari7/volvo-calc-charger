import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PricedSession } from '@shared/types';
import { SessionRow } from './SessionRow';

const base: PricedSession = {
	id: 'abc',
	startUtc: '2026-11-02T23:02:05.000Z',
	endUtc: '2026-11-03T08:30:00.000Z',
	kWh: 12,
	hours: [],
	status: 'priced',
	cost: { spot: 0, markup: 0, transfer: 0, energyTax: 0, vat: 0, total: 18.66 },
	peakShare: 0,
	planned: null,
};

describe('SessionRow', () => {
	it('shows date, kWh, cost, kr/kWh and links to the detail', () => {
		render(<SessionRow session={base} />);
		expect(screen.getByText('Tue 3 Nov')).toBeInTheDocument();
		expect(screen.getByText('00:02 · 12,0 kWh')).toBeInTheDocument();
		expect(screen.queryByText(/peak fee/)).toBeNull();
		expect(screen.getByText('18,66 kr')).toBeInTheDocument();
		expect(screen.getByText('1,56 kr/kWh')).toBeInTheDocument();
		expect(screen.getByRole('link')).toHaveAttribute('href', '/history/abc');
	});

	it('flags the session’s share of the month’s peak fee', () => {
		render(<SessionRow session={{ ...base, peakShare: 200 }} />);
		expect(screen.getByText('+200,00 kr peak fee')).toBeInTheDocument();
	});

	it('shows pending for an unpriced session', () => {
		render(<SessionRow session={{ ...base, status: 'pending', cost: null }} />);
		expect(screen.getByText('pending')).toBeInTheDocument();
		expect(screen.queryByText(/kr\/kWh/)).toBeNull();
	});

	it('shows the signed delta against the planned energy cost, not the cost incl. peak increase', () => {
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, energyCost: 17.46, cost: 25, kWh: 12 };
		const { rerender } = render(<SessionRow session={{ ...base, planned }} />);
		expect(screen.getByText('+1,20 kr vs plan')).toBeInTheDocument();
		rerender(<SessionRow session={{ ...base, planned: { ...planned, energyCost: 20, cost: 22 } }} />);
		expect(screen.getByText('-1,34 kr vs plan')).toBeInTheDocument();
	});

	it('compares at the planned price per kWh when a different amount was charged', () => {
		// Plan: 24 kWh for 34.92 kr = 1.455 kr/kWh; 12 kWh at that price is 17.46 kr.
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, energyCost: 34.92, cost: 40, kWh: 24 };
		render(<SessionRow session={{ ...base, planned }} />);
		expect(screen.getByText('+1,20 kr vs plan')).toBeInTheDocument();
	});

	it('omits the delta for a plan stored without its kWh', () => {
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, energyCost: 17, cost: 17 };
		render(<SessionRow session={{ ...base, planned }} />);
		expect(screen.queryByText(/vs plan/)).toBeNull();
	});

	it('omits the delta when pending', () => {
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, energyCost: 17, cost: 17 };
		render(<SessionRow session={{ ...base, status: 'pending', cost: null, planned }} />);
		expect(screen.queryByText(/vs plan/)).toBeNull();
	});
});
