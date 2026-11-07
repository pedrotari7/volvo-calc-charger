import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { monthTotals } from '@shared/insights';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { PricedSession } from '@shared/types';
import { MonthSummary } from './MonthSummary';

const session = (id: string, over: Partial<PricedSession> = {}): PricedSession => ({
	id,
	startUtc: '2026-11-03T00:00:00.000Z',
	endUtc: '2026-11-03T02:00:00.000Z',
	kWh: 10,
	hours: [],
	status: 'priced',
	cost: { spot: 6, markup: 0.5, transfer: 0.5, energyTax: 1, vat: 2, total: 10 },
	peakShare: 0,
	planned: null,
	...over,
});
const odo = [
	{ km: 1000, date: '2026-11-01' },
	{ km: 1050, date: '2026-11-20' },
];
const totals = (sessions: PricedSession[], peaks = null as Parameters<typeof monthTotals>[3]) =>
	monthTotals(sessions, '2026-11', odo, peaks, DEFAULT_SETTINGS);

describe('MonthSummary', () => {
	it('shows kr per 100 km, petrol cost and saving', () => {
		render(<MonthSummary month='2026-11' totals={totals([session('a')])} final={false} />);
		expect(screen.getByText('20,00 kr')).toBeInTheDocument();
		expect(screen.getByText('67,50 kr')).toBeInTheDocument();
		expect(screen.getByText('57,50 kr')).toBeInTheDocument();
		expect(screen.getByText('10,0 kWh')).toBeInTheDocument();
		expect(screen.getByText('1,00 kr/kWh')).toBeInTheDocument();
	});

	it('marks the peak fee as an estimate unless final', () => {
		const peaks = { month: '2026-11', top3: [], estimatedFee: 5, final: false };
		const { rerender } = render(
			<MonthSummary month='2026-11' totals={totals([session('a')], peaks)} final={false} />
		);
		expect(screen.getByText('Peak fee (estimate)')).toBeInTheDocument();
		expect(screen.getByText('5,00 kr')).toBeInTheDocument();
		rerender(<MonthSummary month='2026-11' totals={totals([session('a')], peaks)} final />);
		expect(screen.getByText('Peak fee')).toBeInTheDocument();
	});

	it('shows the pending count and dashes without odometer data', () => {
		const t = monthTotals(
			[session('a'), session('b', { status: 'pending', cost: null })],
			'2026-11',
			[],
			null,
			DEFAULT_SETTINGS
		);
		render(<MonthSummary month='2026-11' totals={t} final={false} />);
		expect(screen.getByText('1 pending')).toBeInTheDocument();
		expect(screen.getAllByText('–').length).toBeGreaterThan(0);
	});
});
