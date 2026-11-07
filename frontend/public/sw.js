/*
 * Volvo Charge service worker: offline caching plus web push.
 * Bump CACHE_VERSION when the strategy changes; `activate` drops older caches.
 * A new worker waits until the page sends SKIP_WAITING, so a deploy never
 * swaps the build mid-session.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `volvo-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `volvo-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', event => {
	// A missing asset must not wedge the worker.
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then(cache => cache.addAll(PRECACHE))
			.catch(() => undefined)
	);
});

self.addEventListener('message', event => {
	if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys.filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

// Content-hashed build output and fixed-path icons never change meaning.
const isImmutable = url =>
	url.pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname);

// Never cache an error page.
const cacheIfOk = (cacheName, request, response) => {
	if (response.ok) {
		const copy = response.clone();
		caches.open(cacheName).then(cache => cache.put(request, copy));
	}

	return response;
};

self.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Firestore and Google auth go straight to the network.
	if (url.origin !== self.location.origin) return;

	if (isImmutable(url)) {
		event.respondWith(
			caches
				.match(request)
				.then(cached => cached || fetch(request).then(response => cacheIfOk(STATIC_CACHE, request, response)))
		);
		return;
	}

	// Navigations: network-first, offline page as the last resort.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then(response => cacheIfOk(RUNTIME_CACHE, request, response))
				.catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
		);
		return;
	}

	// Everything else (Next RSC payloads included): network-first, cache as fallback.
	event.respondWith(
		fetch(request)
			.then(response => cacheIfOk(RUNTIME_CACHE, request, response))
			.catch(async () => (await caches.match(request)) ?? Response.error())
	);
});

importScripts('/sw-lib.js');

// The backend sends FCM messages with `notification` and `data`; this worker renders them.
self.addEventListener('push', event => {
	const { title, body, tag, url } = self.__swLib.parsePush(event.data, self.location.origin, `push-${Date.now()}`);

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			tag,
			data: { url },
		})
	);
});

self.addEventListener('notificationclick', event => {
	event.notification.close();

	const target = new URL(
		self.__swLib.safeUrl(event.notification.data?.url, self.location.origin),
		self.location.origin
	).href;

	event.waitUntil(
		(async () => {
			const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = clientList.find(client => client.url === target && 'focus' in client);

			if (open) {
				await open.focus();
				return;
			}

			await self.clients.openWindow(target);
		})()
	);
});
