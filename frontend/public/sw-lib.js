/*
 * Pure helpers for sw.js, loaded with importScripts('/sw-lib.js').
 * Kept free of service-worker globals so unit tests can load them too.
 */
(function (root) {
	const DEFAULT_TITLE = 'Volvo Charge';

	// Same-origin targets only; anything else (absolute other-origin, javascript:, malformed) becomes '/'.
	const safeUrl = (value, origin) => {
		try {
			const u = new URL(typeof value === 'string' && value ? value : '/', origin);
			return u.origin === origin ? u.pathname + u.search + u.hash : '/';
		} catch {
			return '/';
		}
	};

	// FCM webpush payload -> what showNotification needs. `uniqueTag` is the fallback so pushes don't overwrite each other.
	const parsePush = (data, origin, uniqueTag) => {
		let raw = {};
		let text = '';
		try {
			raw = (data && data.json()) || {};
		} catch {
			raw = {};
			try {
				text = (data && data.text()) || '';
			} catch {
				text = '';
			}
		}
		const notification = raw.notification || {};
		const extra = raw.data || {};
		return {
			title: notification.title || extra.title || DEFAULT_TITLE,
			body: notification.body || extra.body || text || '',
			tag: extra.tag || extra.kind || uniqueTag,
			url: safeUrl(extra.url || (raw.fcmOptions && raw.fcmOptions.link) || notification.click_action, origin),
		};
	};

	root.__swLib = { safeUrl, parsePush };
})(typeof self !== 'undefined' ? self : globalThis);
