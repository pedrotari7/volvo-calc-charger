'use client';

import * as stylex from '@stylexjs/stylex';
import { CLIMATE_RUN_MINUTES, COMMAND_KEY } from '@shared/commands';
import type { CarCommand } from '@shared/commands';
import { formatAgo } from '@shared/format';
import type { CarState, IsoUtc, RemoteState } from '@shared/types';
import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { getFunctionsClient } from '../lib/firebaseClient';
import { colors, fonts, tint } from '../app/tokens.stylex';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

const spin = stylex.keyframes({ from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } });
const glow = stylex.keyframes({
	'0%, 100%': { opacity: 0.55 },
	'50%': { opacity: 1 },
});

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
	headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 16 },
	heading: {
		fontSize: 13,
		textTransform: 'uppercase',
		letterSpacing: '0.02em',
		color: colors.muted,
	},
	sub: { paddingInline: 16, paddingTop: 6, fontSize: 13, color: colors.faint },
	pill: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 6,
		height: 24,
		paddingInline: 10,
		borderRadius: 12,
		fontSize: 12,
		fontWeight: 600,
	},
	online: { backgroundColor: tint.brand15, color: colors.good },
	offline: { backgroundColor: tint.fill, color: colors.muted },
	dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'currentColor' },
	dotLive: { animationName: glow, animationDuration: '2s', animationIterationCount: 'infinite' },

	climate: {
		position: 'relative',
		overflow: 'hidden',
		display: 'flex',
		alignItems: 'center',
		gap: 14,
		padding: 16,
		borderRadius: 18,
		backgroundColor: colors.surface,
	},
	climateOn: {
		backgroundImage: 'radial-gradient(120% 140% at 0% 0%, rgb(255 159 10 / 0.24), transparent 60%)',
	},
	climateIcon: {
		flexShrink: 0,
		width: 48,
		height: 48,
		borderRadius: 24,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	fan: { display: 'flex' },
	spinning: {
		animationName: spin,
		animationDuration: '2.4s',
		animationTimingFunction: 'linear',
		animationIterationCount: 'infinite',
	},
	climateText: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
	climateTitle: { fontSize: 17, fontWeight: 600, color: colors.ink },
	climateSub: { fontSize: 13, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	track: { height: 4, borderRadius: 2, backgroundColor: tint.fill, overflow: 'hidden', marginTop: 4 },
	bar: { height: '100%', borderRadius: 2, backgroundColor: colors.warn, transitionProperty: 'width' },
	climateActions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
	pillButton: {
		whiteSpace: 'nowrap',
		height: 34,
		paddingInline: 16,
		borderRadius: 17,
		fontSize: 15,
		fontWeight: 600,
		transform: { default: 'none', ':active': 'scale(0.95)' },
		transitionProperty: 'transform',
		transitionDuration: '150ms',
	},
	startButton: { backgroundColor: colors.warn, color: '#1c1200' },
	stopButton: { backgroundColor: tint.fill, color: colors.ink },
	textButton: { fontSize: 13, color: colors.muted, paddingBlock: 2 },

	groupLabel: { paddingInline: 16, paddingTop: 4, fontSize: 13, color: colors.muted },
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
	stateTile: { color: colors.muted, transform: 'none' },
	iconWrap: {
		width: 38,
		height: 38,
		borderRadius: 19,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	lock: { backgroundColor: tint.info15, color: colors.info },
	locked: { backgroundColor: tint.brand15, color: colors.good },
	guard: { backgroundColor: 'rgb(125 122 255 / 0.2)', color: '#a5a3ff' },
	warm: { backgroundColor: 'rgb(255 159 10 / 0.18)', color: colors.warn },
	find: { backgroundColor: 'rgb(255 214 10 / 0.16)', color: '#ffd60a' },
	off: { backgroundColor: tint.fill, color: colors.muted },
	message: { fontSize: 15, color: colors.muted, textAlign: 'center' },
	last: { fontFamily: fonts.sans, fontSize: 13, color: colors.faint, textAlign: 'center' },
});

/** What the backend callable resolves with (backend/src/providers/volvo.ts CommandResult). */
interface CommandResult {
	ok: boolean;
	status: string;
	message?: string;
}

// The client SDK reports HttpsError codes as `functions/<code>`.
const ERROR_MESSAGES: Record<string, string> = {
	'failed-precondition': 'Reconnect Volvo in Settings',
	'not-found': 'No car found',
	'invalid-argument': 'The car does not know that command',
};

function errorMessage(err: unknown): string {
	const code = (err as { code?: unknown } | null)?.code;
	const key = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
	return ERROR_MESSAGES[key] ?? 'That did not work. Try again.';
}

type Tone = 'lock' | 'guard' | 'warm' | 'find' | 'off';

interface Action {
	command: CarCommand;
	label: string;
	confirm: string;
	done: string;
	/** Past tense for the "last command" line. */
	past: string;
	icon: IconName;
	tone: Tone;
}

const ACTIONS: Record<CarCommand, Action> = {
	lock: {
		command: 'lock',
		label: 'Lock',
		confirm: 'Lock the car?',
		done: 'Locked',
		past: 'Locked',
		icon: 'lock',
		tone: 'lock',
	},
	'lock-reduced-guard': {
		command: 'lock-reduced-guard',
		label: 'Lock, sensors off',
		confirm: 'Lock the car with the interior motion and tilt sensors off (for a pet or a ferry)?',
		done: 'Locked with sensors off',
		past: 'Locked with sensors off',
		icon: 'shield',
		tone: 'guard',
	},
	'climatization-start': {
		command: 'climatization-start',
		label: 'Start climate',
		confirm: 'Start the climate now?',
		done: 'Climate starting',
		past: 'Started climate',
		icon: 'fan',
		tone: 'warm',
	},
	'climatization-stop': {
		command: 'climatization-stop',
		label: 'Stop climate',
		confirm: 'Stop the climate?',
		done: 'Climate stopped',
		past: 'Stopped climate',
		icon: 'power',
		tone: 'off',
	},
	honk: {
		command: 'honk',
		label: 'Honk',
		confirm: 'Sound the horn?',
		done: 'Honked',
		past: 'Honked',
		icon: 'horn',
		tone: 'find',
	},
	flash: {
		command: 'flash',
		label: 'Flash lights',
		confirm: 'Flash the lights?',
		done: 'Lights flashed',
		past: 'Flashed the lights',
		icon: 'flash',
		tone: 'find',
	},
	'honk-flash': {
		command: 'honk-flash',
		label: 'Honk & flash',
		confirm: 'Sound the horn and flash the lights?',
		done: 'Honked and flashed',
		past: 'Honked and flashed',
		icon: 'locate',
		tone: 'find',
	},
};

/**
 * Lock and climate show until Volvo says otherwise (the original commands). The rest need Volvo's
 * list of supported commands to include them.
 */
const DEFAULT_SUPPORTED: CarCommand[] = ['lock', 'climatization-start', 'climatization-stop'];
const supports = (commands: string[] | null | undefined, c: CarCommand) =>
	commands ? commands.includes(COMMAND_KEY[c]) : DEFAULT_SUPPORTED.includes(c);

const sentence = (code: string) => {
	const s = code.toLowerCase().replace(/_/g, ' ');
	return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Minutes of the estimated climate run left, or null when it is not running. */
export function climateMinutesLeft(startedAt: string | null | undefined, now: string): number | null {
	if (!startedAt) return null;
	const left = CLIMATE_RUN_MINUTES - (Date.parse(now) - Date.parse(startedAt)) / 60_000;
	return left > 0 && left <= CLIMATE_RUN_MINUTES ? Math.ceil(left) : null;
}

interface Props {
	locked: boolean | null;
	/** Volvo's supported command keys (car/profile); null or missing until known. */
	commands?: string[] | null;
	remote?: RemoteState | null;
	access?: CarState['access'];
	now?: string;
}

export const CommandButtons = ({ locked, commands, remote, access, now: nowProp }: Props) => {
	const [busy, setBusy] = useState<CarCommand | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const now = nowProp ?? new Date().toISOString();

	const run = async (command: CarCommand) => {
		const action = ACTIONS[command];
		if (!window.confirm(action.confirm)) return;
		setBusy(command);
		setMessage(null);
		try {
			const call = httpsCallable<{ command: CarCommand }, CommandResult>(getFunctionsClient(), 'carCommand');
			const { data } = await call({ command });
			if (data.ok) setMessage(action.done);
			else if (data.status === '403')
				setMessage('Volvo did not allow that. Reconnect Volvo in Settings to grant it.');
			else setMessage(`Failed: ${data.message ?? data.status}`);
		} catch (err) {
			setMessage(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const has = (c: CarCommand) => supports(commands, c);
	const left = climateMinutesLeft(remote?.climateStartedAt, now);
	const running = left !== null;
	const find = (['honk', 'flash', 'honk-flash'] as const).filter(has);
	const lockActions = (['lock', 'lock-reduced-guard'] as const).filter(has);
	const climate = has('climatization-start') || has('climatization-stop');
	const last = remote?.last ?? null;
	const lastAction = last && (ACTIONS as Record<string, Action | undefined>)[last.command];

	const tile = (c: CarCommand) => {
		const a = ACTIONS[c];
		return (
			<button
				key={c}
				type='button'
				disabled={busy !== null}
				onClick={() => void run(c)}
				{...stylex.props(styles.button)}
			>
				<span {...stylex.props(styles.iconWrap, styles[a.tone])}>
					{busy === c ? <Spinner /> : <Icon name={a.icon} size={20} strokeWidth={2} />}
				</span>
				{a.label}
			</button>
		);
	};

	return (
		<section aria-label='Remote' {...stylex.props(styles.wrap)}>
			<div {...stylex.props(styles.headRow)}>
				<h2 {...stylex.props(styles.heading)}>Remote</h2>
				{access ? (
					<span
						title={access.value.reason ? sentence(access.value.reason) : undefined}
						{...stylex.props(styles.pill, access.value.available ? styles.online : styles.offline)}
					>
						<span aria-hidden {...stylex.props(styles.dot, access.value.available && styles.dotLive)} />
						{access.value.available ? 'Car online' : 'Car offline'}
					</span>
				) : null}
			</div>
			{access && !access.value.available ? (
				<p {...stylex.props(styles.sub)}>
					Commands may not reach the car
					{access.value.reason ? ` (${sentence(access.value.reason).toLowerCase()})` : ''}.
				</p>
			) : null}

			{climate ? (
				<div role='group' aria-label='Climate' {...stylex.props(styles.climate, running && styles.climateOn)}>
					<span {...stylex.props(styles.climateIcon, running ? styles.warm : styles.off)}>
						<span {...stylex.props(styles.fan, running && styles.spinning)}>
							<Icon name='fan' size={24} strokeWidth={2} />
						</span>
					</span>
					<span {...stylex.props(styles.climateText)}>
						<span {...stylex.props(styles.climateTitle)}>Climate</span>
						<span {...stylex.props(styles.climateSub)}>
							{running ? `On · about ${left} min left` : 'Off · heats or cools the cabin for ~30 min'}
						</span>
						{running ? (
							<span aria-hidden {...stylex.props(styles.track)}>
								<span
									{...stylex.props(styles.bar)}
									style={{ width: `${Math.round((left / CLIMATE_RUN_MINUTES) * 100)}%` }}
								/>
							</span>
						) : null}
					</span>
					<span {...stylex.props(styles.climateActions)}>
						{running && has('climatization-stop') ? (
							<button
								type='button'
								aria-label='Stop climate'
								disabled={busy !== null}
								onClick={() => void run('climatization-stop')}
								{...stylex.props(styles.pillButton, styles.stopButton)}
							>
								{busy === 'climatization-stop' ? <Spinner /> : 'Stop'}
							</button>
						) : has('climatization-start') ? (
							<>
								<button
									type='button'
									aria-label='Start climate'
									disabled={busy !== null}
									onClick={() => void run('climatization-start')}
									{...stylex.props(styles.pillButton, styles.startButton)}
								>
									{busy === 'climatization-start' ? <Spinner /> : 'Start'}
								</button>
								{has('climatization-stop') ? (
									<button
										type='button'
										aria-label='Stop climate'
										disabled={busy !== null}
										onClick={() => void run('climatization-stop')}
										{...stylex.props(styles.textButton)}
									>
										Stop
									</button>
								) : null}
							</>
						) : null}
					</span>
				</div>
			) : null}

			{lockActions.length ? (
				<div role='group' aria-label='Doors' {...stylex.props(styles.row)}>
					{locked === true ? (
						<div {...stylex.props(styles.button, styles.stateTile)}>
							<span {...stylex.props(styles.iconWrap, styles.locked)}>
								<Icon name='check' size={20} strokeWidth={2.4} />
							</span>
							Car is locked
						</div>
					) : (
						lockActions.map(tile)
					)}
				</div>
			) : null}

			{find.length ? (
				<>
					<h3 {...stylex.props(styles.groupLabel)}>Find my car</h3>
					<div role='group' aria-label='Find my car' {...stylex.props(styles.row)}>
						{find.map(tile)}
					</div>
				</>
			) : null}

			{message ? (
				<p role='status' {...stylex.props(styles.message)}>
					{message}
				</p>
			) : last && lastAction ? (
				<p {...stylex.props(styles.last)}>
					{last.ok ? lastAction.past : `${lastAction.label} failed`} · {formatAgo(last.at, now as IsoUtc)}
				</p>
			) : null}
		</section>
	);
};
