'use client';

import { useEffect, useState } from 'react';

// ISO "now" that refreshes every minute.
export const useNow = (): string => {
	const [now, setNow] = useState(() => new Date().toISOString());

	useEffect(() => {
		const id = setInterval(() => setNow(new Date().toISOString()), 60_000);

		return () => clearInterval(id);
	}, []);

	return now;
};
