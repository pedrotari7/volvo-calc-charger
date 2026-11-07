import { getMessaging } from 'firebase-admin/messaging';
import { DEFAULT_SETTINGS } from '../../../shared/types';
import type { Settings } from '../../../shared/types';
import { db } from './firebase';

/** FCM requires an absolute HTTPS link for web push. */
export const APP_ORIGIN = 'https://volvo-calc-charger.vercel.app';

export type PushKind = 'plugIn' | 'sessionDone' | 'leftOpen' | 'reconnect';
export interface PushInput {
	kind: PushKind;
	title: string;
	body: string;
	dedupeKey: string;
	url: string;
}
export type Messaging = Pick<ReturnType<typeof getMessaging>, 'sendEachForMulticast'>;

const DEAD_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
]);

async function notificationEnabled(kind: PushKind): Promise<boolean> {
	if (kind === 'reconnect') return true;
	const stored = (await db.doc('config/settings').get()).data() as Partial<Settings> | undefined;
	const notifications = { ...DEFAULT_SETTINGS.notifications, ...stored?.notifications };
	return notifications[kind];
}

export async function sendPush(
	input: PushInput,
	messaging: Messaging = getMessaging()
): Promise<'sent' | 'duplicate' | 'disabled'> {
	if (!(await notificationEnabled(input.kind))) return 'disabled';

	const ref = db.doc(`private/notified/keys/${encodeURIComponent(input.dedupeKey)}`);
	const fresh = await db.runTransaction(async tx => {
		if ((await tx.get(ref)).exists) return false;
		tx.create(ref, { kind: input.kind, at: new Date().toISOString() });
		return true;
	});
	if (!fresh) return 'duplicate';

	try {
		const tokenDocs = (await db.collectionGroup('pushTokens').get()).docs;
		// The token is the doc id; a `token` field wins when present.
		const tokenOf = (d: (typeof tokenDocs)[number]): string => (d.get('token') as string | undefined) ?? d.id;
		const tokens = tokenDocs.map(tokenOf);
		if (tokens.length === 0) return 'sent';

		const res = await messaging.sendEachForMulticast({
			tokens,
			notification: { title: input.title, body: input.body },
			data: { url: input.url, kind: input.kind },
			webpush: { fcmOptions: { link: new URL(input.url, APP_ORIGIN).href } },
		});
		const dead = res.responses
			.map((r, i) => (r.error && DEAD_TOKEN_CODES.has(r.error.code) ? tokens[i] : null))
			.filter((t): t is string => t !== null);
		await Promise.all(tokenDocs.filter(d => dead.includes(tokenOf(d))).map(d => d.ref.delete()));
	} catch (e) {
		await ref.delete();
		throw e;
	}
	return 'sent';
}
