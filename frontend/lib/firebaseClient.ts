import type { FirebaseApp } from 'firebase/app';
import { getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import {
	connectFirestoreEmulator,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
} from 'firebase/firestore';

const emulatorsOn = () => process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

// Everything is lazy so `next build` works without Firebase env vars.
export const getFirebaseApp = (): FirebaseApp =>
	getApps()[0] ??
	initializeApp({
		apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
		authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
		projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
		messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
		appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
	});

let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

export const getAuthClient = (): Auth => {
	if (!authInstance) {
		authInstance = getAuth(getFirebaseApp());
		if (emulatorsOn()) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
	}

	return authInstance;
};

export const getDb = (): Firestore => {
	if (!dbInstance) {
		dbInstance = initializeFirestore(getFirebaseApp(), {
			localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
		});
		if (emulatorsOn()) connectFirestoreEmulator(dbInstance, '127.0.0.1', 8085);
	}

	return dbInstance;
};

export const getFunctionsClient = (): Functions => getFunctions(getFirebaseApp(), 'europe-west1');
