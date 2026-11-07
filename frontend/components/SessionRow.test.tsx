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
		expect(screen.getByText('2026-11-03')).toBeInTheDocument();
		expect(screen.getByText('12,0 kWh')).toBeInTheDocument();
		expect(screen.getByText('18,66 kr')).toBeInTheDocument();
		expect(screen.getByText('1,56 kr/kWh')).toBeInTheDocument();
		expect(screen.getByRole('link')).toHaveAttribute('href', '/history/abc');
	});

	it('shows pending for an unpriced session', () => {
		render(<SessionRow session={{ ...base, status: 'pending', cost: null }} />);
		expect(screen.getByText('pending')).toBeInTheDocument();
		expect(screen.queryByText(/kr\/kWh/)).toBeNull();
	});

	it('shows the signed delta against the plan', () => {
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, cost: 17.46 };
		const { rerender } = render(<SessionRow session={{ ...base, planned }} />);
		expect(screen.getByText('+1,20 kr vs plan')).toBeInTheDocument();
		rerender(<SessionRow session={{ ...base, planned: { ...planned, cost: 20 } }} />);
		expect(screen.getByText('-1,34 kr vs plan')).toBeInTheDocument();
	});

	it('omits the delta when pending', () => {
		const planned = { kw: 3.7, start: base.startUtc, end: base.endUtc, cost: 17 };
		render(<SessionRow session={{ ...base, status: 'pending', cost: null, planned }} />);
		expect(screen.queryByText(/vs plan/)).toBeNull();
	});
});
