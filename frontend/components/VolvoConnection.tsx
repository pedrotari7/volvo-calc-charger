'use client';

import * as stylex from '@stylexjs/stylex';
import { localDateOf } from '@shared/time';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { getFunctionsClient } from '../lib/firebaseClient';
import { useDoc } from '../lib/useDoc';
import { form } from './formStyles';

interface VolvoStatus {
	connected?: boolean;
	grantStartedAt?: string | null;
	lastRefreshError?: string | null;
}

const GRANT_MONTHS = 3;

// Local (Stockholm) calendar date + 3 months, clamped to the month's last day.
const validUntil = (grantStartedAt: string): string => {
	const [y, m, d] = localDateOf(grantStartedAt).split('-').map(Number) as [number, number, number];
	const lastDay = new Date(Date.UTC(y, m - 1 + GRANT_MONTHS + 1, 0)).getUTCDate();
	const target = new Date(Date.UTC(y, m - 1 + GRANT_MONTHS, Math.min(d, lastDay), 12));

	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(target);
};

export const VolvoConnection = () => {
	const status = useDoc<VolvoStatus>('status/volvo');
	const params = useSearchParams();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const result = params.get('volvo');
	const reason = params.get('reason');

	const call = async (name: 'volvoAuthStart' | 'volvoDisconnect') => {
		setBusy(true);
		setError(null);
		try {
			const { data } = await httpsCallable<void, { url?: string }>(getFunctionsClient(), name)();
			if (name === 'volvoAuthStart' && data.url) window.location.assign(data.url);
			else setBusy(false);
		} catch {
			setError(name === 'volvoAuthStart' ? 'Could not start the Volvo sign-in.' : 'Could not disconnect Volvo.');
			setBusy(false);
		}
	};

	const disconnect = () => {
		if (window.confirm('Disconnect Volvo? Car data will stop updating.')) void call('volvoDisconnect');
	};

	const data = status.data;
	const expired = Boolean(data?.lastRefreshError);
	const connected = !expired && data?.connected === true;

	return (
		<section aria-label='Volvo connection' {...stylex.props(form.section)}>
			<h2 {...stylex.props(form.heading)}>Volvo</h2>
			{result === 'connected' ? (
				<p role='status' {...stylex.props(form.ok)}>
					Volvo connected
				</p>
			) : null}
			{result === 'error' ? (
				<p role='alert' {...stylex.props(form.error)}>
					Couldn&rsquo;t connect Volvo{reason ? ` (${reason})` : ''}
				</p>
			) : null}
			{status.error ? (
				<p role='alert' {...stylex.props(form.error)}>
					Couldn&rsquo;t load the Volvo status
				</p>
			) : status.loading ? null : (
				<p {...stylex.props(form.note)}>
					{expired
						? 'Connection expired'
						: connected
							? data?.grantStartedAt
								? `Connected · valid until ${validUntil(data.grantStartedAt)}`
								: 'Connected'
							: 'Not connected'}
				</p>
			)}
			<div {...stylex.props(form.row)}>
				<button
					type='button'
					disabled={busy}
					onClick={() => void call('volvoAuthStart')}
					{...stylex.props(form.button)}
				>
					{expired || connected ? 'Reconnect' : 'Connect Volvo'}
				</button>
				{connected || expired ? (
					<button type='button' disabled={busy} onClick={disconnect} {...stylex.props(form.secondary)}>
						Disconnect
					</button>
				) : null}
			</div>
			{error ? (
				<p role='alert' {...stylex.props(form.error)}>
					{error}
				</p>
			) : null}
		</section>
	);
};
