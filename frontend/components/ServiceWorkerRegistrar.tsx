'use client';

import { useEffect } from 'react';

const ServiceWorkerRegistrar = () => {
	useEffect(() => {
		if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
	}, []);

	return null;
};

export default ServiceWorkerRegistrar;
