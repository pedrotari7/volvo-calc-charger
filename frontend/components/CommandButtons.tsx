'use client';

import * as stylex from '@stylexjs/stylex';
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { getFunctionsClient } from '../lib/firebaseClient';
import { colors, tint } from '../app/tokens.stylex';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
	heading: {
		paddingInline: 16,
		fontSize: 13,
		textTransform: 'uppercase',
		letterSpacing: '0.02em',
		color: colors.muted,
	},
	row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 },
	button: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: 14,
		minHeight: 96,
		padding: 14,
		borderRadius: 18,
		backgroundColor: colors.surface,
		color: colors.ink,
		fontSize: 15,
		fontWeight: 600,
		textAlign: 'left',
		transform: { default: 'none', ':active': 'scale(0.95)' },
		transitionProperty: 'transform',
		transitionDuration: '150ms',
	},
	iconWrap: {
		width: 38,
		height: 38,
		borderRadius: 19,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	lock: { backgroundColor: tint.info15, color: colors.info },
	warm: { backgroundColor: 'rgb(255 159 10 / 0.18)', color: colors.warn },
	off: { backgroundColor: tint.fill, color: colors.muted },
	message: { fontSize: 15, color: colors.muted, textAlign: 'center' },
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

const ACTIONS: { command: Command; label: string; confirm: string; icon: IconName; tone: 'lock' | 'warm' | 'off' }[] = [
	{ command: 'lockCar', label: 'Lock', confirm: 'Lock the car?', icon: 'lock', tone: 'lock' },
	{ command: 'startClimate', label: 'Start climate', confirm: 'Start the climate now?', icon: 'fan', tone: 'warm' },
	{ command: 'stopClimate', label: 'Stop climate', confirm: 'Stop the climate?', icon: 'power', tone: 'off' },
];

export const CommandButtons = ({ locked }: { locked: boolean | null }) => {
	const [busy, setBusy] = useState<Command | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const run = async (command: Command, confirmText: string) => {
		if (!window.confirm(confirmText)) return;
		setBusy(command);
		setMessage(null);
		try {
			const call = httpsCallable<void, CommandResult>(getFunctionsClient(), command);
			const { data } = await call();
			setMessage(data.ok ? 'Done' : `Failed: ${data.message ?? data.status}`);
		} catch (err) {
			setMessage(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	return (
		<section aria-label='Remote' {...stylex.props(styles.wrap)}>
			<h2 {...stylex.props(styles.heading)}>Remote</h2>
			<div {...stylex.props(styles.row)}>
				{ACTIONS.filter(a => !(a.command === 'lockCar' && locked === true)).map(a => (
					<button
						key={a.command}
						type='button'
						disabled={busy !== null}
						onClick={() => void run(a.command, a.confirm)}
						{...stylex.props(styles.button)}
					>
						<span {...stylex.props(styles.iconWrap, styles[a.tone])}>
							{busy === a.command ? <Spinner /> : <Icon name={a.icon} size={20} strokeWidth={2} />}
						</span>
						{a.label}
					</button>
				))}
			</div>
			{message ? (
				<p role='status' {...stylex.props(styles.message)}>
					{message}
				</p>
			) : null}
		</section>
	);
};
