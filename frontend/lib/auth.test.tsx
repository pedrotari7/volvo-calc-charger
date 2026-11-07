import { act, render, screen, waitFor } from '@testing-library/react';
import { DEV_USER } from '@shared/devUser';
import AppLayout from '../app/(app)/layout';
import { AuthProvider, useAuth } from './auth';

const mocks = vi.hoisted(() => ({
	getDoc: vi.fn(),
	signOut: vi.fn(async () => {}),
	signInEmail: vi.fn(async () => {}),
	emit: null as null | ((user: unknown) => void),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('./firebaseClient', () => ({ getAuthClient: () => ({}), getDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), getDoc: mocks.getDoc }));
vi.mock('firebase/auth', () => ({
	GoogleAuthProvider: class {
		setCustomParameters() {}
	},
	signInWithPopup: vi.fn(),
	signInWithEmailAndPassword: mocks.signInEmail,
	signOut: mocks.signOut,
	onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
		mocks.emit = cb;
		return () => {};
	},
}));

const signedIn = async () => {
	render(
		<AppLayout>
			<p>child content</p>
		</AppLayout>
	);
	await act(async () => mocks.emit?.({ uid: 'u1', email: 'a@b.se' }));
};

describe('auth gate', () => {
	afterEach(() => vi.unstubAllEnvs());

	const signedOut = async () => {
		render(
			<AppLayout>
				<p>child content</p>
			</AppLayout>
		);
		await act(async () => mocks.emit?.(null));
	};

	it('never offers the dev sign-in outside the emulators', async () => {
		vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', '');
		await signedOut();

		expect(screen.queryByRole('button', { name: 'Sign in as dev user' })).not.toBeInTheDocument();
	});

	it('refuses signInDev when the emulators flag is off', async () => {
		vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', '');
		let signInDev: () => Promise<void> = async () => {};
		const Probe = () => {
			signInDev = useAuth().signInDev;
			return null;
		};
		render(
			<AuthProvider>
				<Probe />
			</AuthProvider>
		);

		const error = await signInDev().then(
			() => null,
			(e: unknown) => e
		);
		expect(String(error)).toMatch(/emulators/);
		expect(mocks.signInEmail).not.toHaveBeenCalled();
	});

	it('offers the dev sign-in against the emulators and uses the shared credentials', async () => {
		vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', '1');
		await signedOut();

		screen.getByRole('button', { name: 'Sign in as dev user' }).click();
		await waitFor(() => expect(mocks.signInEmail).toHaveBeenCalledWith({}, DEV_USER.email, DEV_USER.password));
	});

	it('shows a sign-in button when signed out', async () => {
		render(
			<AppLayout>
				<p>child content</p>
			</AppLayout>
		);
		await act(async () => mocks.emit?.(null));

		expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
		expect(screen.queryByText('child content')).not.toBeInTheDocument();
	});

	it('blocks an account whose allowlist read is permission-denied', async () => {
		mocks.getDoc.mockRejectedValue({ code: 'permission-denied' });
		await signedIn();

		expect(await screen.findByText('This account is not allowed')).toBeInTheDocument();
		expect(screen.queryByText('child content')).not.toBeInTheDocument();
		screen.getByRole('button', { name: /sign out/i }).click();
		expect(mocks.signOut).toHaveBeenCalled();
	});

	it('renders children when the allowlist read resolves', async () => {
		mocks.getDoc.mockResolvedValue({ exists: () => true });
		await signedIn();

		await waitFor(() => expect(screen.getByText('child content')).toBeInTheDocument());
		expect(screen.queryByText('This account is not allowed')).not.toBeInTheDocument();
	});
});
