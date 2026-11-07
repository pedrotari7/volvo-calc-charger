'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut as fbSignOut,
} from 'firebase/auth';
import { DEV_USER } from '@shared/devUser';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from './firebaseClient';

interface AuthState {
	user: User | null;
	/** False until Firebase has reported the initial sign-in state. */
	ready: boolean;
	/** `null` while checking, `false` when the email is not in `config/allowlist`. */
	allowed: boolean | null;
	signIn(): Promise<void>;
	/** Email/password sign-in as the seeded dev user. Only meaningful against the Auth emulator. */
	signInDev(): Promise<void>;
	signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState>({
	user: null,
	ready: false,
	allowed: null,
	signIn: async () => {},
	signInDev: async () => {},
	signOut: async () => {},
});

// Rules let only allowlisted emails read this doc, so a denied read is the check.
const checkAllowed = async (): Promise<boolean | null> => {
	try {
		await getDoc(doc(getDb(), 'config', 'allowlist'));
		return true;
	} catch (error) {
		if ((error as { code?: string }).code === 'permission-denied') return false;
		console.error('Allowlist check failed', error);
		return null;
	}
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null);
	const [ready, setReady] = useState(false);
	const [allowed, setAllowed] = useState<boolean | null>(null);

	useEffect(
		() =>
			onAuthStateChanged(getAuthClient(), next => {
				setUser(next);
				setAllowed(null);
				setReady(true);
			}),
		[]
	);

	const uid = user?.uid;
	useEffect(() => {
		if (!uid) return;
		let cancelled = false;
		void checkAllowed().then(result => {
			if (!cancelled) setAllowed(result);
		});

		return () => {
			cancelled = true;
		};
	}, [uid]);

	const signIn = useCallback(async () => {
		const provider = new GoogleAuthProvider();
		provider.setCustomParameters({ prompt: 'select_account' });
		await signInWithPopup(getAuthClient(), provider);
	}, []);

	const signInDev = useCallback(async () => {
		await signInWithEmailAndPassword(getAuthClient(), DEV_USER.email, DEV_USER.password);
	}, []);

	const signOut = useCallback(() => fbSignOut(getAuthClient()), []);

	const value = useMemo(
		() => ({ user, ready, allowed, signIn, signInDev, signOut }),
		[user, ready, allowed, signIn, signInDev, signOut]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** The dev button is shown only when the app is wired to the emulators. */
export const devSignInEnabled = () => process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

export const useAuth = () => useContext(AuthContext);
