'use client';

import type { QueryConstraint } from 'firebase/firestore';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getDb } from './firebaseClient';

export interface CollectionState<T> {
	data: (T & { id: string })[];
	loading: boolean;
	error: Error | null;
}

// Memoise `constraints` in the caller: a new array each render resubscribes.
export const useCollection = <T,>(path: string, constraints: QueryConstraint[] = []): CollectionState<T> => {
	const [state, setState] = useState<CollectionState<T>>({ data: [], loading: true, error: null });

	useEffect(() => {
		setState({ data: [], loading: true, error: null });

		return onSnapshot(
			query(collection(getDb(), path), ...constraints),
			(snap) =>
				setState({
					data: snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })),
					loading: false,
					error: null,
				}),
			(error) => setState({ data: [], loading: false, error }),
		);
	}, [path, constraints]);

	return state;
};
