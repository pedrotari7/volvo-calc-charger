'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getDb } from './firebaseClient';

export interface DocState<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
}

export const useDoc = <T,>(path: string): DocState<T> => {
	const [state, setState] = useState<DocState<T>>({ data: null, loading: true, error: null });

	useEffect(() => {
		setState({ data: null, loading: true, error: null });

		return onSnapshot(
			doc(getDb(), path),
			(snap) => setState({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null }),
			(error) => setState({ data: null, loading: false, error }),
		);
	}, [path]);

	return state;
};
