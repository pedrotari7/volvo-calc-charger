import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('@/lib/firebaseClient', () => ({ getFunctionsClient: () => ({}) }));

import { ConnectVolvoButton } from './ConnectVolvoButton';

afterEach(() => {
	vi.unstubAllGlobals();
	callable.mockReset();
});

describe('ConnectVolvoButton', () => {
	it('calls volvoAuthStart and navigates to the returned URL', async () => {
		const assign = vi.fn();
		vi.stubGlobal('location', { assign });
		callable.mockResolvedValue({ data: { url: 'https://auth.volvocars.com/x' } });
		render(<ConnectVolvoButton />);
		fireEvent.click(screen.getByRole('button', { name: 'Connect Volvo' }));
		await waitFor(() => expect(assign).toHaveBeenCalledWith('https://auth.volvocars.com/x'));
	});

	it('shows an error and re-enables the button when the callable fails', async () => {
		callable.mockRejectedValue(new Error('permission-denied'));
		render(<ConnectVolvoButton />);
		fireEvent.click(screen.getByRole('button', { name: 'Connect Volvo' }));
		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Connect Volvo' })).toBeEnabled();
	});
});
