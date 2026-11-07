import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getDb, getFirebaseApp } from './firebaseClient';

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'needs-install';

const isIos = () =>
	/iPad|iPhone|iPod/.test(navigator.userAgent) ||
	// iPadOS reports a Mac user agent.
	(/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1);

const isStandalone = () =>
	Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
	(navigator as { standalone?: boolean }).standalone === true;

/**
 * Ask for permission and register this device for push. Call it from a user
 * gesture. The token is the doc id, so registering twice overwrites.
 */
export const enablePush = async (uid: string): Promise<PushResult> => {
	// iOS only allows push for apps on the Home Screen.
	if (isIos() && !isStandalone()) return 'needs-install';

	const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
	if (!vapidKey || typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !(await isSupported())) {
		return 'unsupported';
	}

	if ((await Notification.requestPermission()) !== 'granted') return 'denied';

	const registration = await navigator.serviceWorker.ready;
	const token = await getToken(getMessaging(getFirebaseApp()), { vapidKey, serviceWorkerRegistration: registration });
	if (!token) return 'unsupported';

	await setDoc(doc(getDb(), 'users', uid, 'pushTokens', token), {
		token,
		createdAt: serverTimestamp(),
		userAgent: navigator.userAgent,
	});

	return 'enabled';
};
