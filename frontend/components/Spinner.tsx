import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { colors } from '../app/tokens.stylex';

const spin = stylex.keyframes({ to: { transform: 'rotate(360deg)' } });

const styles = stylex.create({
	spinner: {
		width: 22,
		height: 22,
		borderRadius: '50%',
		borderWidth: 2.5,
		borderStyle: 'solid',
		borderColor: 'rgb(235 235 245 / 0.18)',
		borderTopColor: colors.muted,
		animationName: spin,
		animationDuration: '800ms',
		animationIterationCount: 'infinite',
		animationTimingFunction: 'linear',
		flexShrink: 0,
	},
	note: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 10,
		paddingBlock: 24,
		fontSize: 15,
		color: colors.muted,
		textAlign: 'center',
	},
	error: {
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		paddingBlock: 12,
		paddingInline: 16,
		borderRadius: 12,
		fontSize: 15,
		color: colors.bad,
		backgroundColor: 'color-mix(in srgb, #ff453a 12%, transparent)',
	},
});

export const Spinner = () => <span aria-hidden='true' {...stylex.props(styles.spinner)} />;

/** A loading line ("Loading…") or an inline error, announced to assistive tech. */
export const Note = ({ error, loading, children }: { error?: boolean; loading?: boolean; children: ReactNode }) =>
	error ? (
		<p role='alert' {...stylex.props(styles.error)}>
			{children}
		</p>
	) : (
		<p role='status' {...stylex.props(styles.note)}>
			{loading ? <Spinner /> : null}
			{children}
		</p>
	);
