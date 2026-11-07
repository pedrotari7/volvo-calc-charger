import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribe = vi.fn();
const onSnapshot = vi.fn((..._a: unknown[]) => unsubscribe);
vi.mock('firebase/firestore', () => ({
	onSnapshot: (...a: unknown[]) => onSnapshot(...a),
	doc: (_db: unknown, path: string) => ({ path }),
	collection: (_db: unknown, path: string) => ({ path }),
	query: (c: unknown) => c,
}));
vi.mock('./firebaseClient', () => ({ getDb: () => ({}) }));

import { useCollection } from './useCollection';
import { useDoc } from './useDoc';

beforeEach(() => {
	onSnapshot.mockClear();
	unsubscribe.mockClear();
});

describe('useCollection', () => {
	it('subscribes once across re-renders when no constraints are given', () => {
		const { rerender } = renderHook(() => useCollection('tariffs'));
		rerender();
		rerender();
		rerender();
		expect(onSnapshot).toHaveBeenCalledTimes(1);
	});

	it('maps snapshot docs with their id', () => {
		const { result } = renderHook(() => useCollection<{ a: number }>('tariffs'));
		const onNext = onSnapshot.mock.calls[0]![1] as (s: unknown) => void;
		onNext({ docs: [{ id: 'x', data: () => ({ a: 1 }) }] });
		return vi.waitFor(() =>
			expect(result.current).toEqual({ data: [{ a: 1, id: 'x' }], loading: false, error: null })
		);
	});
});

describe('useDoc', () => {
	it('resubscribes only when the path changes and unsubscribes on unmount', () => {
		const { rerender, unmount } = renderHook(({ p }) => useDoc(p), { initialProps: { p: 'a/b' } });
		rerender({ p: 'a/b' });
		expect(onSnapshot).toHaveBeenCalledTimes(1);
		rerender({ p: 'a/c' });
		expect(onSnapshot).toHaveBeenCalledTimes(2);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		unmount();
		expect(unsubscribe).toHaveBeenCalledTimes(2);
	});
});
