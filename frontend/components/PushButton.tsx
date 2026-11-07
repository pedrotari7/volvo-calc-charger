'use client';

import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import type { PushResult } from '../lib/push';
import { enablePush } from '../lib/push';
import { form } from './formStyles';

const MESSAGES: Record<PushResult, string> = {
	enabled: 'Notifications on for this device',
	denied: "Notifications are blocked in this browser's settings",
	unsupported: "This browser can't receive notifications",
	'needs-install': 'On iPhone, add this app to your Home Screen first (Share → Add to Home Screen)',
};

export const PushButton = () => {
	const { user } = useAuth();
	const [result, setResult] = useState<PushResult | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);

	const run = async () => {
		if (!user) return;
		setBusy(true);
		setFailed(false);
		try {
			setResult(await enablePush(user.uid));
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<button type='button' disabled={busy || !user} onClick={() => void run()} {...stylex.props(form.button)}>
				Enable notifications
			</button>
			{result ? (
				<p role='status' {...stylex.props(result === 'enabled' ? form.ok : form.error)}>
					{MESSAGES[result]}
				</p>
			) : null}
			{failed ? (
				<p role='alert' {...stylex.props(form.error)}>
					Could not enable notifications
				</p>
			) : null}
		</>
	);
};
