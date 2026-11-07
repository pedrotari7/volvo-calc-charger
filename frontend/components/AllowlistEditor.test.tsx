import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn();
const updateDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
	doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
	setDoc: (...a: unknown[]) => setDoc(...a),
	updateDoc: (...a: unknown[]) => updateDoc(...a),
	arrayUnion: (v: string) => ({ union: v }),
	arrayRemove: (v: string) => ({ remove: v }),
}));
vi.mock('../lib/firebaseClient', () => ({ getDb: () => ({}) }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { email: 'Me@Example.com' } }) }));
vi.mock('../lib/useDoc', () => ({
	useDoc: () => ({ data: { emails: ['me@example.com', 'other@example.com'] }, loading: false, error: null }),
}));

import { AllowlistEditor } from './AllowlistEditor';

beforeEach(() => {
	setDoc.mockReset().mockResolvedValue(undefined);
	updateDoc.mockReset().mockResolvedValue(undefined);
});

describe('AllowlistEditor', () => {
	it('disables removing your own email', () => {
		render(<AllowlistEditor />);
		expect(screen.getByRole('button', { name: 'Remove me@example.com' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Remove other@example.com' })).toBeEnabled();
	});

	it('removes another email with arrayRemove', async () => {
		render(<AllowlistEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Remove other@example.com' }));
		await waitFor(() =>
			expect(updateDoc).toHaveBeenCalledWith(
				{ path: 'config/allowlist' },
				{ emails: { remove: 'other@example.com' } }
			)
		);
	});

	it('adds a lowercased, trimmed email with arrayUnion', async () => {
		render(<AllowlistEditor />);
		fireEvent.change(screen.getByLabelText('Email to add'), { target: { value: '  New@Example.com ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
		await waitFor(() =>
			expect(setDoc).toHaveBeenCalledWith(
				{ path: 'config/allowlist' },
				{ emails: { union: 'new@example.com' } },
				{ merge: true }
			)
		);
	});

	it('rejects an invalid email without writing', () => {
		render(<AllowlistEditor />);
		fireEvent.change(screen.getByLabelText('Email to add'), { target: { value: 'nope' } });
		fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
		expect(screen.getByRole('alert')).toHaveTextContent('valid email');
		expect(setDoc).not.toHaveBeenCalled();
	});
});
