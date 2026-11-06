'use client';

import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { getFunctionsClient } from '@/lib/firebaseClient';

// Temporary: moves to Settings once that page exists.
export const ConnectVolvoButton = () => {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = async () => {
		setBusy(true);
		setError(null);
		try {
			const start = httpsCallable<void, { url: string }>(getFunctionsClient(), 'volvoAuthStart');
			const { data } = await start();
			window.location.assign(data.url);
		} catch {
			setError('Could not start the Volvo sign-in.');
			setBusy(false);
		}
	};

	return (
		<>
			<button type='button' onClick={connect} disabled={busy}>
				Connect Volvo
			</button>
			{error ? <p role='alert'>{error}</p> : null}
		</>
	);
};
