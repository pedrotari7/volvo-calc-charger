import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import { colors, tint } from '../app/tokens.stylex';

const DELAYED_AFTER_MS = 60 * 60_000;

const styles = stylex.create({
	stack: { display: 'flex', flexDirection: 'column', gap: 8 },
	banner: {
		padding: 12,
		borderRadius: 12,
		backgroundColor: tint.bad15,
		color: colors.ink,
		fontSize: 14,
		display: 'flex',
		flexDirection: 'column',
		gap: 8,
	},
});

interface Props {
	zaptecLastOkAt: string | null;
	volvoConnected: boolean;
	now: string;
}

export const Banner = ({ zaptecLastOkAt, volvoConnected, now }: Props) => {
	const delayed = zaptecLastOkAt !== null && Date.parse(now) - Date.parse(zaptecLastOkAt) > DELAYED_AFTER_MS;
	if (!delayed && volvoConnected) return null;

	return (
		<div {...stylex.props(styles.stack)}>
			{delayed ? (
				<div role='status' {...stylex.props(styles.banner)}>
					Charger data delayed
				</div>
			) : null}
			{!volvoConnected ? (
				<div role='status' {...stylex.props(styles.banner)}>
					<span>Reconnect Volvo</span>
					<Link href='/settings'>Reconnect in Settings</Link>
				</div>
			) : null}
		</div>
	);
};
