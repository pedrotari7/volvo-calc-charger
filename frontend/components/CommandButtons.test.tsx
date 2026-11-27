import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callable = vi.fn();
const httpsCallable = vi.fn((..._args: unknown[]) => callable);
vi.mock('firebase/functions', () => ({ httpsCallable: (...a: unknown[]) => httpsCallable(...a) }));
vi.mock('../lib/firebaseClient', () => ({ getFunctionsClient: () => ({}) }));

import { climateMinutesLeft, CommandButtons } from './CommandButtons';

afterEach(() => {
	vi.unstubAllGlobals();
	callable.mockReset();
	httpsCallable.mockClear();
});

const NOW = '2026-11-27T07:10:00.000Z';
const ALL = [
	'LOCK',
	'LOCK_REDUCED_GUARD',
	'CLIMATIZATION_START',
	'CLIMATIZATION_STOP',
	'HONK',
	'FLASH',
	'HONK_AND_FLASH',
];

describe('CommandButtons', () => {
	it('shows the car is locked instead of a Lock button, and never mentions unlock', () => {
		const { container } = render(<CommandButtons locked commands={ALL} />);
		expect(screen.queryByRole('button', { name: 'Lock' })).toBeNull();
		expect(screen.getByText('Car is locked')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Start climate' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stop climate' })).toBeInTheDocument();
		expect(container.textContent).not.toMatch(/unlock/i);
	});

	it('shows only lock and climate until Volvo lists the supported commands', () => {
		render(<CommandButtons locked={false} />);
		expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Honk' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Lock, sensors off' })).toBeNull();
	});

	it('offers find-my-car and sensors-off locking when the car supports them', () => {
		render(<CommandButtons locked={false} commands={ALL} />);
		for (const name of ['Lock', 'Lock, sensors off', 'Honk', 'Flash lights', 'Honk & flash'])
			expect(screen.getByRole('button', { name })).toBeInTheDocument();
	});

	it('hides commands the car does not support', () => {
		render(<CommandButtons locked={false} commands={['LOCK', 'HONK']} />);
		expect(screen.getByRole('button', { name: 'Honk' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Flash lights' })).toBeNull();
		expect(screen.queryByRole('group', { name: 'Climate' })).toBeNull();
	});

	it('sends the command through carCommand after confirm', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockResolvedValue({ data: { ok: true, status: 'COMPLETED' } });
		render(<CommandButtons locked={false} commands={ALL} />);
		fireEvent.click(screen.getByRole('button', { name: 'Honk' }));
		expect(await screen.findByText('Honked')).toBeInTheDocument();
		expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'carCommand');
		expect(callable).toHaveBeenCalledWith({ command: 'honk' });
	});

	it('does nothing when the confirm is declined', () => {
		vi.stubGlobal('confirm', () => false);
		render(<CommandButtons locked={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Start climate' }));
		expect(callable).not.toHaveBeenCalled();
	});

	it('shows climate running with the minutes left and a Stop button', () => {
		const remote = { last: null, climateStartedAt: '2026-11-27T07:00:00.000Z' };
		render(<CommandButtons locked={false} remote={remote} now={NOW} />);
		expect(screen.getByText('On · about 20 min left')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Start climate' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Stop climate' })).toBeInTheDocument();
	});

	it('says what was last done and when', () => {
		const remote = {
			last: { command: 'flash', ok: true, status: 'COMPLETED', at: '2026-11-27T07:05:00.000Z' },
			climateStartedAt: null,
		};
		render(<CommandButtons locked={false} remote={remote} now={NOW} />);
		expect(screen.getByText('Flashed the lights · 5 min ago')).toBeInTheDocument();
	});

	it('shows whether the car is reachable', () => {
		const at = NOW;
		const { rerender } = render(
			<CommandButtons locked={false} access={{ value: { available: true, reason: null }, at }} />
		);
		expect(screen.getByText('Car online')).toBeInTheDocument();
		rerender(
			<CommandButtons locked={false} access={{ value: { available: false, reason: 'CAR_IN_SLEEP_MODE' }, at }} />
		);
		expect(screen.getByText('Car offline')).toBeInTheDocument();
		expect(screen.getByText(/may not reach the car \(car in sleep mode\)/)).toBeInTheDocument();
	});

	it('shows Failed with the message, or the status, when the car rejects the command', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockResolvedValueOnce({ data: { ok: false, status: 'REJECTED', message: 'Car is asleep' } });
		render(<CommandButtons locked={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Start climate' }));
		expect(await screen.findByText('Failed: Car is asleep')).toBeInTheDocument();
		callable.mockResolvedValueOnce({ data: { ok: false, status: 'TIMEOUT' } });
		fireEvent.click(screen.getByRole('button', { name: 'Start climate' }));
		expect(await screen.findByText('Failed: TIMEOUT')).toBeInTheDocument();
	});

	it('asks to reconnect when Volvo refuses a command the app has no permission for', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockResolvedValueOnce({ data: { ok: false, status: '403' } });
		render(<CommandButtons locked={false} commands={ALL} />);
		fireEvent.click(screen.getByRole('button', { name: 'Flash lights' }));
		expect(await screen.findByText(/Reconnect Volvo in Settings to grant it/)).toBeInTheDocument();
	});

	it('maps callable error codes to readable messages', async () => {
		vi.stubGlobal('confirm', () => true);
		const err = (code: string) =>
			Object.assign(new Error(code), { name: 'FirebaseError', code: `functions/${code}` });
		callable.mockRejectedValueOnce(err('failed-precondition'));
		render(<CommandButtons locked={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
		expect(await screen.findByText('Reconnect Volvo in Settings')).toBeInTheDocument();
		callable.mockRejectedValueOnce(err('not-found'));
		fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
		expect(await screen.findByText('No car found')).toBeInTheDocument();
	});

	it('shows an error message when the call fails', async () => {
		vi.stubGlobal('confirm', () => true);
		callable.mockRejectedValue(new Error('x'));
		render(<CommandButtons locked={null} />);
		fireEvent.click(screen.getByRole('button', { name: 'Stop climate' }));
		await waitFor(() => expect(screen.getByText(/did not work/)).toBeInTheDocument());
	});
});

describe('climateMinutesLeft', () => {
	it('counts down the estimated run and is null outside it', () => {
		expect(climateMinutesLeft('2026-11-27T07:00:00.000Z', NOW)).toBe(20);
		expect(climateMinutesLeft('2026-11-27T06:00:00.000Z', NOW)).toBeNull();
		expect(climateMinutesLeft('2026-11-27T08:00:00.000Z', NOW)).toBeNull();
		expect(climateMinutesLeft(null, NOW)).toBeNull();
	});
});
