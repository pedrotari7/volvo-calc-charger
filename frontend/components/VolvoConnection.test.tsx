import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
const httpsCallable = vi.fn((_f: unknown, _name: string) => callable);
vi.mock('firebase/functions', () => ({ httpsCallable: (f: unknown, n: string) => httpsCallable(f, n) }));
vi.mock('../lib/firebaseClient', () => ({ getFunctionsClient: () => ({}) }));

const useDoc = vi.fn((_p: string): unknown => ({ data: null, loading: false, error: null }));
vi.mock('../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

import { VolvoConnection } from './VolvoConnection';

const status = (data: unknown) => useDoc.mockReturnValue({ data, loading: false, error: null });

beforeEach(() => {
	search = '';
	callable.mockReset();
	httpsCallable.mockClear();
	status(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('VolvoConnection', () => {
	it('shows valid-until three calendar months after the grant', () => {
		status({ connected: true, grantStartedAt: '2026-11-06T10:15:00.000Z', lastRefreshError: null });
		render(<VolvoConnection />);
		expect(screen.getByText('Connected · valid until 6 Feb 2027')).toBeInTheDocument();
		expect(useDoc).toHaveBeenCalledWith('status/volvo');
	});

	it('clamps to the last day of the month', () => {
		status({ connected: true, grantStartedAt: '2026-11-30T10:00:00.000Z' });
		render(<VolvoConnection />);
		expect(screen.getByText('Connected · valid until 28 Feb 2027')).toBeInTheDocument();
	});

	it('offers Connect Volvo when not connected or missing', () => {
		render(<VolvoConnection />);
		expect(screen.getByText('Not connected')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Connect Volvo' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
	});

	it('shows Connection expired with Reconnect on a refresh error', () => {
		status({ connected: false, lastRefreshError: 'invalid_grant' });
		render(<VolvoConnection />);
		expect(screen.getByText('Connection expired')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
	});

	it('calls volvoAuthStart and navigates to the url', async () => {
		const assign = vi.fn();
		vi.stubGlobal('location', { assign });
		callable.mockResolvedValue({ data: { url: 'https://auth.volvocars.com/x' } });
		render(<VolvoConnection />);
		fireEvent.click(screen.getByRole('button', { name: 'Connect Volvo' }));
		await waitFor(() => expect(assign).toHaveBeenCalledWith('https://auth.volvocars.com/x'));
		expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'volvoAuthStart');
	});

	it('shows an error and re-enables the button when the callable fails', async () => {
		callable.mockRejectedValue(new Error('nope'));
		render(<VolvoConnection />);
		fireEvent.click(screen.getByRole('button', { name: 'Connect Volvo' }));
		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Connect Volvo' })).toBeEnabled();
	});

	it('disconnects only after confirming', async () => {
		status({ connected: true, grantStartedAt: '2026-11-06T10:00:00.000Z' });
		callable.mockResolvedValue({ data: { ok: true } });
		const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
		vi.stubGlobal('confirm', confirm);
		render(<VolvoConnection />);
		fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
		expect(callable).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
		await waitFor(() => expect(callable).toHaveBeenCalledTimes(1));
		expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'volvoDisconnect');
	});

	it('reads the OAuth result from the query string', () => {
		search = 'volvo=connected';
		const { unmount } = render(<VolvoConnection />);
		expect(screen.getByText('Volvo connected')).toBeInTheDocument();
		unmount();
		search = 'volvo=error&reason=access_denied';
		render(<VolvoConnection />);
		expect(screen.getByText('Couldn’t connect Volvo (access_denied)')).toBeInTheDocument();
	});
});
