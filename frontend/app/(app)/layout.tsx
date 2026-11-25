'use client';

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { AuthProvider, devSignInEnabled, useAuth } from '../../lib/auth';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import Tabs from '../../components/Tabs';
import { colors, layout, tint } from '../tokens.stylex';

const rise = stylex.keyframes({
	from: { opacity: 0, transform: 'translateY(16px) scale(0.96)' },
	to: { opacity: 1, transform: 'none' },
});

const styles = stylex.create({
	center: {
		minHeight: '100dvh',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	welcome: {
		minHeight: '100dvh',
		display: 'flex',
		flexDirection: 'column',
		paddingTop: `calc(${layout.safeTop} + 24px)`,
		paddingBottom: `calc(${layout.safeBottom} + 24px)`,
		paddingInline: 24,
		maxWidth: 480,
		marginInline: 'auto',
		backgroundImage: `radial-gradient(120% 60% at 50% 0%, ${tint.brand15}, transparent 70%)`,
	},
	hero: {
		flexGrow: 1,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 12,
		textAlign: 'center',
		animationName: rise,
		animationDuration: '600ms',
		animationTimingFunction: layout.ease,
	},
	appIcon: {
		width: 88,
		height: 88,
		borderRadius: 22,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: '#04140a',
		backgroundImage: `linear-gradient(160deg, #5ef08a, ${colors.brandStrong})`,
		boxShadow: `0 12px 40px ${tint.brand30}`,
		marginBottom: 8,
	},
	title: { fontSize: 34, fontWeight: 700, color: colors.ink, letterSpacing: '0.01em' },
	tagline: { fontSize: 17, color: colors.muted, maxWidth: 280 },
	actions: { display: 'flex', flexDirection: 'column', gap: 12 },
	primary: {
		height: 50,
		borderRadius: 14,
		backgroundColor: colors.ink,
		color: colors.canvas,
		fontSize: 17,
		fontWeight: 600,
		transform: { default: 'none', ':active': 'scale(0.97)' },
		opacity: { default: 1, ':active': 0.85 },
		transitionProperty: 'transform, opacity',
		transitionDuration: '120ms',
	},
	secondary: {
		height: 50,
		borderRadius: 14,
		backgroundColor: tint.fill,
		color: colors.ink,
		fontSize: 17,
		fontWeight: 600,
		transform: { default: 'none', ':active': 'scale(0.97)' },
		transitionProperty: 'transform',
		transitionDuration: '120ms',
	},
	email: { fontSize: 15, color: colors.muted },
	content: { paddingBottom: `calc(${layout.tabBar} + ${layout.safeBottom} + 16px)`, minHeight: '100dvh' },
});

const Splash = () => (
	<div {...stylex.props(styles.center)} role='status' aria-label='Loading'>
		<Spinner />
	</div>
);

const Welcome = ({ children, tagline }: { children: ReactNode; tagline: ReactNode }) => (
	<div {...stylex.props(styles.welcome)}>
		<div {...stylex.props(styles.hero)}>
			<div {...stylex.props(styles.appIcon)}>
				<Icon name='bolt' size={48} filled strokeWidth={1.2} />
			</div>
			<h1 {...stylex.props(styles.title)}>Volvo Charge</h1>
			<div {...stylex.props(styles.tagline)}>{tagline}</div>
		</div>
		<div {...stylex.props(styles.actions)}>{children}</div>
	</div>
);

const Gate = ({ children }: { children: ReactNode }) => {
	const { user, ready, allowed, signIn, signInDev, signOut } = useAuth();

	if (!ready) return <Splash />;

	if (!user) {
		return (
			<Welcome tagline='Charge the car when power is cheapest, and see what every session really cost.'>
				<button type='button' onClick={() => void signIn()} {...stylex.props(styles.primary)}>
					Sign in with Google
				</button>
				{devSignInEnabled() ? (
					<button type='button' onClick={() => void signInDev()} {...stylex.props(styles.secondary)}>
						Sign in as dev user
					</button>
				) : null}
			</Welcome>
		);
	}

	if (allowed === false) {
		return (
			<Welcome
				tagline={
					<>
						<p>This account is not allowed</p>
						<p data-selectable {...stylex.props(styles.email)}>
							{user.email}
						</p>
					</>
				}
			>
				<button type='button' onClick={() => void signOut()} {...stylex.props(styles.secondary)}>
					Sign out
				</button>
			</Welcome>
		);
	}

	if (allowed === null) return <Splash />;

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
