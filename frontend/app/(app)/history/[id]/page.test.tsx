import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatKr } from '@shared/format';
import { priceSession } from '@shared/pricing';
import { TEST_TARIFF } from '@shared/testdata';
import type { PriceDay, PricedSession } from '@shared/types';
import { parseZaptecSessions } from '@shared/zaptec';

const fixture = JSON.parse(
	readFileSync(resolve(__dirname, '../../../../../backend/test/fixtures/zaptec/chargehistory.json'), 'utf8')
);
const raw = parseZaptecSessions(fixture)[0]!;

const quarter = (hh: string, mm: string, v: number) => ({
	start: `2026-11-03T${hh}:${mm}:00+01:00`,
	sekPerKwhExVat: v,
});
const day: PriceDay = {
	date: '2026-11-03',
	quarters: [
		...['00', '15', '30', '45'].map(m => quarter('00', m, 0.8)),
		...['00', '15', '30', '45'].map((m, i) => quarter('01', m, [0.6, 0.62, 0.58, 0.6][i]!)),
	],
};
const priced = priceSession(raw, { '2026-11-03': day }, [TEST_TARIFF]);
const session: PricedSession = { ...raw, ...priced, peakShare: 2.5, planned: null };

const useDoc = vi.fn((_p: string): unknown => ({ data: session, loading: false, error: null }));
const useCollection = vi.fn((_p: string, ..._r: unknown[]): unknown => ({ data: [], loading: false, error: null }));
vi.mock('../../../../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));
vi.mock('../../../../lib/useCollection', () => ({
	useCollection: (p: string, c?: unknown, e?: boolean) => useCollection(p, c, e),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: raw.id }) }));
vi.mock('firebase/firestore', () => ({ documentId: () => 'id', where: (...a: unknown[]) => a }));

import SessionDetailPage from './page';

beforeEach(() => {
	useDoc.mockReset().mockReturnValue({ data: session, loading: false, error: null });
	useCollection.mockReset().mockImplementation((p: string) => ({
		data: p === 'prices' ? [{ ...day, id: '2026-11-03' }] : [{ ...TEST_TARIFF }],
		loading: false,
		error: null,
	}));
});

describe('SessionDetailPage', () => {
	it('reads the session by id', () => {
		render(<SessionDetailPage />);
		expect(useDoc).toHaveBeenCalledWith(`sessions/${raw.id}`);
	});

	it('shows two hour rows and the total', () => {
		render(<SessionDetailPage />);
		const table = screen.getByRole('table');
		expect(within(table).getByText('00:00')).toBeInTheDocument();
		expect(within(table).getByText('01:00')).toBeInTheDocument();
		expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 2 hours + footer
		expect(screen.getByText('18,66 kr')).toBeInTheDocument();
	});

	it('shows the peak share in kr and the total including it', () => {
		render(<SessionDetailPage />);
		expect(screen.getByText(/Peak fee share/)).toBeInTheDocument();
		expect(screen.getByText('2,50 kr')).toBeInTheDocument();
		expect(screen.queryByText(/kW$/)).toBeNull();
		expect(screen.getByText('Total incl. peak share')).toBeInTheDocument();
		expect(screen.getByText(formatKr(session.cost!.total + 2.5))).toBeInTheDocument();
	});

	it('links back to history', () => {
		render(<SessionDetailPage />);
		expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('href', '/history');
	});

	it('shows Price pending for a pending session', () => {
		useDoc.mockReturnValue({ data: { ...session, status: 'pending', cost: null }, loading: false, error: null });
		useCollection.mockImplementation((p: string) => ({
			data: p === 'prices' ? [] : [{ ...TEST_TARIFF }],
			loading: false,
			error: null,
		}));
		render(<SessionDetailPage />);
		expect(screen.getByText('Price pending')).toBeInTheDocument();
		expect(screen.queryByText('18,66 kr')).toBeNull();
	});

	it('keeps the stored headline when prices are missing', () => {
		useCollection.mockImplementation((p: string) => ({
			data: p === 'prices' ? [] : [{ ...TEST_TARIFF }],
			loading: false,
			error: null,
		}));
		render(<SessionDetailPage />);
		expect(screen.queryByText('Price pending')).toBeNull();
		expect(screen.getByText('18,66 kr')).toBeInTheDocument();
		expect(screen.getAllByText('–').length).toBeGreaterThan(0);
	});

	it('notes when the breakdown differs from the stored total', () => {
		const { rerender } = render(<SessionDetailPage />);
		expect(screen.queryByText('Breakdown uses current prices and tariffs')).toBeNull();
		useDoc.mockReturnValue({
			data: { ...session, cost: { ...session.cost!, total: 20 } },
			loading: false,
			error: null,
		});
		rerender(<SessionDetailPage />);
		expect(screen.getByText('20,00 kr')).toBeInTheDocument();
		expect(screen.getByText('Breakdown uses current prices and tariffs')).toBeInTheDocument();
	});

	it('shows neither pending nor dashes while prices load, and disables the query until the session exists', () => {
		useCollection.mockImplementation((p: string) => ({ data: [], loading: p === 'prices', error: null }));
		render(<SessionDetailPage />);
		expect(screen.queryByText('Price pending')).toBeNull();
		expect(screen.queryByText('–')).toBeNull();
		expect(screen.getByText('Loading…')).toBeInTheDocument();
		expect(useCollection).toHaveBeenCalledWith('prices', expect.anything(), true);
		useDoc.mockReturnValue({ data: null, loading: true, error: null });
		render(<SessionDetailPage />);
		expect(useCollection).toHaveBeenCalledWith('prices', expect.anything(), false);
	});

	it('shows not found and error notes', () => {
		useDoc.mockReturnValue({ data: null, loading: false, error: null });
		const { unmount } = render(<SessionDetailPage />);
		expect(screen.getByText('Session not found')).toBeInTheDocument();
		unmount();
		useDoc.mockReturnValue({ data: null, loading: false, error: new Error('x') });
		render(<SessionDetailPage />);
		expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the session');
	});
});
