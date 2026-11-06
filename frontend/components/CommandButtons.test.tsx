import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
const httpsCallable = vi.fn((..._args: unknown[]) => callable);
vi.mock('firebase/functions', () => ({ httpsCallable: (...a: unknown[]) => httpsCallable(...a) }));
vi.mock('../lib/firebaseClient', () => ({ getFunctionsClient: () => ({}) }));

import { CommandButtons } from './CommandButtons';

afterEach(() => {
	vi.unstubAllGlobals();
	callable.mockReset();
	httpsCallable.mockClear();
});

describe('CommandButtons', () => {
	it('hides Lock when locked and never mentions unlock', () => {
		const { container } = render(<CommandButtons locked />);
		expect(screen.queryByRole('button', { name: 'Lock' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Start climate' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stop climate' })).toBeInTheDocument();
		expect(container.textContent).not.toMatch(/unlock/i);
	});

	it('shows Lock when not locked and calls lockCar after confirm', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockResolvedValue({ data: { message: 'Car locked' } });
		render(<CommandButtons locked={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
		expect(await screen.findByText('Car locked')).toBeInTheDocument();
		expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'lockCar');
	});

	it('does nothing when the confirm is declined', () => {
		vi.stubGlobal('confirm', () => false);
		render(<CommandButtons locked={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Start climate' }));
		expect(callable).not.toHaveBeenCalled();
	});

	it('shows an error message when the call fails', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockRejectedValue(new Error('x'));
		render(<CommandButtons locked={null} />);
		fireEvent.click(screen.getByRole('button', { name: 'Stop climate' }));
		await waitFor(() => expect(screen.getByText(/did not work/)).toBeInTheDocument());
	});
});
