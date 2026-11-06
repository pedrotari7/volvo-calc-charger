import { act, render, screen, waitFor } from '@testing-library/react';
import AppLayout from '../app/(app)/layout';

const mocks = vi.hoisted(() => ({
	getDoc: vi.fn(),
	signOut: vi.fn(async () => {}),
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
