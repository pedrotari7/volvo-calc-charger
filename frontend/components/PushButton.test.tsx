import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enablePush = vi.fn(async (_uid: string): Promise<string> => 'enabled');
// Rejections go through a plain function so vitest's call tracking doesn't report them as test errors.
let rejectNext = false;
vi.mock('../lib/push', () => ({
	enablePush: (uid: string) => (rejectNext ? Promise.reject(new Error('x')) : enablePush(uid)),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));

import { PushButton } from './PushButton';

beforeEach(() => {
	rejectNext = false;
	enablePush.mockReset();
});

describe('PushButton', () => {
	it.each([
		['enabled', 'Notifications on for this device'],
		['denied', "Notifications are blocked in this browser's settings"],
		['unsupported', "This browser can't receive notifications"],
		['needs-install', 'On iPhone, add this app to your Home Screen first (Share → Add to Home Screen)'],
	])('shows the %s result', async (result, text) => {
		enablePush.mockResolvedValue(result);
		render(<PushButton />);
		fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
		expect(await screen.findByText(text)).toBeInTheDocument();
		expect(enablePush).toHaveBeenCalledWith('u1');
	});

	it('shows an error when registration throws', async () => {
		rejectNext = true;
		render(<PushButton />);
		fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('Could not enable notifications');
	});
});
