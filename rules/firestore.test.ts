import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { join } from 'path';

const ME = 'me@x.se';
let testEnv: RulesTestEnvironment;

const asMe = (verified = true) =>
	testEnv.authenticatedContext('uid-me', { email: ME, email_verified: verified }).firestore();
const asStranger = () =>
	testEnv.authenticatedContext('uid-s', { email: 'stranger@x.se', email_verified: true }).firestore();

const READABLE = [
	'car/state',
	'odometer/2026-11-03',
	'sessions/a',
	'prices/2026-11-03',
	'plans/2026-11-03',
	'peaks/2026-11',
	'charger/state',
	'config/settings',
	'config/allowlist',
	'tariffs/t1',
	'status/zaptec',
	'status/volvo',
];
const CLIENT_WRITABLE = ['config/settings', 'tariffs/t1', 'config/allowlist', 'users/uid-me/pushTokens/tok'];
const FUNCTION_OWNED = [
	'sessions/a',
	'car/state',
	'odometer/2026-11-03',
	'plans/x',
	'peaks/x',
	'prices/x',
	'charger/state',
	'status/zaptec',
	'status/volvo',
	'users/other/pushTokens/tok',
];
const PRIVATE = ['private/volvo', 'private/volvoAuth', 'private/notified'];

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: 'demo-volvo',
		firestore: { rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8') },
	});
});

afterAll(async () => {
	await testEnv.cleanup();
});

beforeEach(async () => {
	await testEnv.clearFirestore();
	await testEnv.withSecurityRulesDisabled(async (ctx) => {
		const fs = ctx.firestore();
		await setDoc(doc(fs, 'config/allowlist'), { emails: [ME] });
		for (const p of [...READABLE, ...PRIVATE]) {
			if (p !== 'config/allowlist') await setDoc(doc(fs, p), { v: 1 });
		}
	});
});

describe('allowlisted user', () => {
	it.each(READABLE)('reads %s', async (p) => {
		await assertSucceeds(getDoc(doc(asMe(), p)));
	});

	it.each(CLIENT_WRITABLE)('writes %s', async (p) => {
		await assertSucceeds(setDoc(doc(asMe(), p), { v: 2 }));
	});

	it.each(FUNCTION_OWNED)('cannot write %s', async (p) => {
		await assertFails(setDoc(doc(asMe(), p), { v: 2 }));
		await assertFails(deleteDoc(doc(asMe(), p)));
	});

	it.each(PRIVATE)('cannot read or write %s', async (p) => {
		await assertFails(getDoc(doc(asMe(), p)));
		await assertFails(setDoc(doc(asMe(), p), { v: 2 }));
	});

	it('cannot read another user pushTokens', async () => {
		await assertFails(getDoc(doc(asMe(), 'users/other/pushTokens/tok')));
	});

	it('cannot read unlisted car docs', async () => {
		await assertFails(getDoc(doc(asMe(), 'car/other')));
	});

	it('is denied on unlisted collections', async () => {
		await assertFails(getDoc(doc(asMe(), 'misc/x')));
		await assertFails(setDoc(doc(asMe(), 'misc/x'), { v: 1 }));
	});
});

describe('non-allowlisted callers', () => {
	it.each([...READABLE, ...PRIVATE])('stranger cannot read %s', async (p) => {
		await assertFails(getDoc(doc(asStranger(), p)));
	});

	it.each(CLIENT_WRITABLE)('stranger cannot write %s', async (p) => {
		await assertFails(setDoc(doc(asStranger(), p), { v: 2 }));
	});

	it('unverified email cannot read car/state', async () => {
		await assertFails(getDoc(doc(asMe(false), 'car/state')));
	});

	it('missing allowlist doc denies reads', async () => {
		await testEnv.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'config/allowlist')));
		await assertFails(getDoc(doc(asMe(), 'car/state')));
	});

	it('unauthenticated cannot read car/state', async () => {
		await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'car/state')));
	});
});
