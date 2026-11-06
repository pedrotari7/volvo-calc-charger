import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idle = { data: null, loading: false, error: null };
const useDoc = vi.fn((_p: string): unknown => idle);
const useCollection = vi.fn((_p: string): unknown => ({ data: [], loading: false, error: null }));
vi.mock('../../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));
vi.mock('../../lib/useCollection', () => ({ useCollection: (p: string) => useCollection(p) }));
vi.mock('../../lib/useNow', () => ({ useNow: () => '2026-11-07T12:00:00.000Z' }));
vi.mock('firebase/firestore', () => ({ documentId: () => 'id', where: () => ({}) }));
vi.mock('../../components/Banner', () => ({ Banner: () => null }));
vi.mock('../../components/CommandButtons', () => ({ CommandButtons: () => null }));

import HomePage from './page';

beforeEach(() => {
	useDoc.mockReset().mockReturnValue(idle);
	useCollection.mockReset().mockReturnValue({ data: [], loading: false, error: null });
});

describe('HomePage', () => {
	it('shows an error line when prices fail to load', () => {
		useCollection.mockImplementation((p) =>
			p === 'prices' ? { data: [], loading: false, error: new Error('denied') } : { data: [], loading: false, error: null },
		);
		render(<HomePage />);
		expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load prices");
		expect(screen.queryByText('No prices yet')).toBeNull();
	});

	it('shows loading instead of "No prices yet" while prices load', () => {
		useCollection.mockReturnValue({ data: [], loading: true, error: null });
		render(<HomePage />);
		expect(screen.getByText('Loading prices…')).toBeInTheDocument();
		expect(screen.queryByText('No prices yet')).toBeNull();
	});

	it('reads the plan for the previous local date before noon', () => {
		render(<HomePage />);
		expect(useDoc).toHaveBeenCalledWith('plans/2026-11-07');
	});
});
