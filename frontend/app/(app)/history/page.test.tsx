import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricedSession } from '@shared/types';

const mk = (id: string, startUtc: string): PricedSession => ({
	id,
	startUtc,
	endUtc: startUtc,
	kWh: 10,
	hours: [],
	status: 'priced',
	cost: { spot: 0, markup: 0, transfer: 0, energyTax: 0, vat: 0, total: 10 },
	peakShare: 0,
	planned: null,
});
const sessions = [
	mk('old', '2026-10-05T10:00:00.000Z'),
	mk('new1', '2026-11-02T10:00:00.000Z'),
	mk('new2', '2026-11-05T10:00:00.000Z'),
];

const useCollection = vi.fn((_p: string): unknown => ({ data: [], loading: false, error: null }));
const useDoc = vi.fn((_p: string): unknown => ({ data: null, loading: false, error: null }));
vi.mock('../../../lib/useCollection', () => ({ useCollection: (p: string) => useCollection(p) }));
vi.mock('../../../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));

import HistoryPage from './page';

beforeEach(() => {
	useDoc.mockReset().mockReturnValue({ data: null, loading: false, error: null });
	useCollection.mockReset().mockImplementation((p: string) => ({
		data: p === 'sessions' ? sessions : p === 'peaks' ? [{ id: '2026-11', month: '2026-11', top3: [], estimatedFee: 3, final: false }] : [],
		loading: false,
		error: null,
	}));
});

describe('HistoryPage', () => {
	it('groups by month newest first, sessions newest first', () => {
		render(<HistoryPage />);
		const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
		expect(headings).toEqual(['2026-11', '2026-10']);
		const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(['/history/new2', '/history/new1', '/history/old']);
		expect(screen.getAllByText('Peak fee (estimate)')).toHaveLength(2);
		expect(screen.getByText('3,00 kr')).toBeInTheDocument();
	});

	it('shows empty, loading and error notes', () => {
		useCollection.mockImplementation(() => ({ data: [], loading: false, error: null }));
		const { unmount } = render(<HistoryPage />);
		expect(screen.getByText('No sessions yet')).toBeInTheDocument();
		unmount();
		useCollection.mockImplementation(() => ({ data: [], loading: true, error: null }));
		const r = render(<HistoryPage />);
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		r.unmount();
		useCollection.mockImplementation(() => ({ data: [], loading: false, error: new Error('x') }));
		render(<HistoryPage />);
		expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load history');
	});
});
