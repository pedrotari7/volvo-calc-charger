'use client';

import * as stylex from '@stylexjs/stylex';
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { getFunctionsClient } from '../lib/firebaseClient';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
	button: {
		height: 44,
		paddingInline: 16,
		borderRadius: 12,
		backgroundColor: colors.raised,
		color: colors.ink,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: colors.line,
		fontSize: 14,
	},
	message: { fontSize: 14, color: colors.muted, width: '100%' },
});

type Command = 'lockCar' | 'startClimate' | 'stopClimate';

/** What the backend callables resolve with (backend/src/providers/volvo.ts CommandResult). */
interface CommandResult {
	ok: boolean;
	status: string;
	message?: string;
}

// The client SDK reports HttpsError codes as `functions/<code>`.
const ERROR_MESSAGES: Record<string, string> = {
	'failed-precondition': 'Reconnect Volvo in Settings',
	'not-found': 'No car found',
};

function errorMessage(err: unknown): string {
	const code = (err as { code?: unknown } | null)?.code;
	const key = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
	return ERROR_MESSAGES[key] ?? 'That did not work. Try again.';
}

const ACTIONS: { command: Command; label: string; confirm: string }[] = [
	{ command: 'lockCar', label: 'Lock', confirm: 'Lock the car?' },
	{ command: 'startClimate', label: 'Start climate', confirm: 'Start the climate now?' },
	{ command: 'stopClimate', label: 'Stop climate', confirm: 'Stop the climate?' },
];

export const CommandButtons = ({ locked }: { locked: boolean | null }) => {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const run = async (command: Command, confirmText: string) => {
		if (!window.confirm(confirmText)) return;
		setBusy(true);
		setMessage(null);
		try {
			const call = httpsCallable<void, CommandResult>(getFunctionsClient(), command);
			const { data } = await call();
			setMessage(data.ok ? 'Done' : `Failed: ${data.message ?? data.status}`);
		} catch (err) {
			setMessage(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div {...stylex.props(styles.row)}>
			{ACTIONS.filter(a => !(a.command === 'lockCar' && locked === true)).map(a => (
				<button
					key={a.command}
					type='button'
					disabled={busy}
					onClick={() => void run(a.command, a.confirm)}
					{...stylex.props(styles.button)}
				>
					{a.label}
				</button>
			))}
			{message ? (
				<p role='status' {...stylex.props(styles.message)}>
					{message}
				</p>
			) : null}
		</div>
	);
};
