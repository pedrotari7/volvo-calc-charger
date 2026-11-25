import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import { colors, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';

const DELAYED_AFTER_MS = 60 * 60_000;

const styles = stylex.create({
	stack: { display: 'flex', flexDirection: 'column', gap: 8 },
	banner: {
		display: 'flex',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: 12,
		paddingBlock: 12,
		paddingInline: 14,
		borderRadius: 14,
		backgroundColor: tint.warn15,
		color: colors.ink,
		fontSize: 15,
	},
	icon: { color: colors.warn, flexShrink: 0 },
	text: { flexGrow: 1, fontWeight: 500 },
	link: {
		flexShrink: 0,
		fontSize: 15,
		fontWeight: 600,
		color: colors.warn,
		opacity: { default: 1, ':active': 0.5 },
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
					<Icon name='warning' size={20} strokeWidth={2} {...stylex.props(styles.icon)} />
					<span {...stylex.props(styles.text)}>Charger data delayed</span>
				</div>
			) : null}
			{!volvoConnected ? (
				<div role='status' {...stylex.props(styles.banner)}>
					<Icon name='warning' size={20} strokeWidth={2} {...stylex.props(styles.icon)} />
					<span {...stylex.props(styles.text)}>Reconnect Volvo</span>
					<Link href='/settings' {...stylex.props(styles.link)}>
						Reconnect in Settings
					</Link>
				</div>
			) : null}
		</div>
	);
};
