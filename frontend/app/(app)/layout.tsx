'use client';

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { AuthProvider, useAuth } from '../../lib/auth';
import Tabs from '../../components/Tabs';
import { colors } from '../tokens.stylex';

const styles = stylex.create({
	center: {
		minHeight: '100dvh',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 16,
		padding: 24,
		textAlign: 'center',
	},
	button: {
		height: 44,
		paddingInline: 20,
		borderRadius: 12,
		backgroundColor: colors.brand,
		color: colors.canvas,
		fontWeight: 600,
	},
	content: { paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' },
	muted: { color: colors.muted },
});

const Gate = ({ children }: { children: ReactNode }) => {
	const { user, ready, allowed, signIn, signOut } = useAuth();

	if (!ready) return <div {...stylex.props(styles.center)} role='status' aria-label='Loading' />;

	if (!user) {
		return (
			<div {...stylex.props(styles.center)}>
				<h1>Volvo Charge</h1>
				<button type='button' onClick={() => void signIn()} {...stylex.props(styles.button)}>
					Sign in with Google
				</button>
			</div>
		);
	}

	if (allowed === false) {
		return (
			<div {...stylex.props(styles.center)}>
				<p>This account is not allowed</p>
				<p {...stylex.props(styles.muted)}>{user.email}</p>
				<button type='button' onClick={() => void signOut()} {...stylex.props(styles.button)}>
					Sign out
				</button>
			</div>
		);
	}

	if (allowed === null) return <div {...stylex.props(styles.center)} role='status' aria-label='Loading' />;

	return (
		<>
			<div {...stylex.props(styles.content)}>{children}</div>
			<Tabs />
		</>
	);
};

const AppLayout = ({ children }: { children: ReactNode }) => (
	<AuthProvider>
		<Gate>{children}</Gate>
	</AuthProvider>
);

export default AppLayout;
