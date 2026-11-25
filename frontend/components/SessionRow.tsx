import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { localDateOf } from '@shared/time';
import type { PricedSession } from '@shared/types';
import Link from 'next/link';
import { colors, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';
import { list } from './List';

const styles = stylex.create({
	icon: {
		width: 32,
		height: 32,
		borderRadius: 8,
		flexShrink: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tint.brand15,
		color: colors.brand,
	},
	pendingIcon: { backgroundColor: tint.fill, color: colors.muted },
	lead: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
	col: { display: 'flex', flexDirection: 'column', gap: 1, fontVariantNumeric: 'tabular-nums' },
	right: { alignItems: 'flex-end', textAlign: 'right' },
	primary: { fontSize: 17, color: colors.ink },
	muted: { fontSize: 13, color: colors.muted },
	bad: { fontSize: 13, color: colors.bad },
	good: { fontSize: 13, color: colors.good },
	pending: { fontSize: 17, color: colors.muted },
});

export const SessionRow = ({ session: s }: { session: PricedSession }) => {
	const total = s.status === 'priced' && s.cost ? s.cost.total : null;
	const delta = total !== null && s.planned ? total - s.planned.energyCost : null;

	return (
		<Link href={`/history/${s.id}`} {...stylex.props(list.cell, list.pressable)}>
			<span {...stylex.props(styles.lead)}>
				<span {...stylex.props(styles.icon, total === null && styles.pendingIcon)}>
					<Icon name='bolt' size={18} filled strokeWidth={1} />
				</span>
				<span {...stylex.props(styles.col)}>
					<span {...stylex.props(styles.primary)}>{localDateOf(s.startUtc)}</span>
					<span {...stylex.props(styles.muted)}>{formatKwh(s.kWh)}</span>
				</span>
			</span>
			<span {...stylex.props(list.value)}>
				<span {...stylex.props(styles.col, styles.right)}>
					<span {...stylex.props(total === null ? styles.pending : styles.primary)}>
						{total === null ? 'pending' : formatKr(total)}
					</span>
					{total !== null && s.kWh > 0 ? (
						<span {...stylex.props(styles.muted)}>{`${formatKr(total / s.kWh)}/kWh`}</span>
					) : null}
					{delta !== null ? (
						<span {...stylex.props(delta > 0 ? styles.bad : styles.good)}>
							{`${delta > 0 ? '+' : ''}${formatKr(delta)} vs plan`}
						</span>
					) : null}
				</span>
				<Icon name='chevronRight' size={18} strokeWidth={2.4} {...stylex.props(list.chevron)} />
			</span>
		</Link>
	);
};
