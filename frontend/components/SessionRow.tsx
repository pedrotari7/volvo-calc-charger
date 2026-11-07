import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { localDateOf } from '@shared/time';
import type { PricedSession } from '@shared/types';
import Link from 'next/link';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	row: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 12,
		padding: 12,
		borderRadius: 12,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: colors.line,
		color: colors.ink,
		fontSize: 14,
	},
	col: { display: 'flex', flexDirection: 'column', gap: 2 },
	right: { alignItems: 'flex-end' },
	muted: { fontSize: 13, color: colors.muted },
	bad: { fontSize: 13, color: colors.bad },
	good: { fontSize: 13, color: colors.good },
});

export const SessionRow = ({ session: s }: { session: PricedSession }) => {
	const total = s.status === 'priced' && s.cost ? s.cost.total : null;
	const delta = total !== null && s.planned ? total - s.planned.energyCost : null;

	return (
		<Link href={`/history/${s.id}`} {...stylex.props(styles.row)}>
			<span {...stylex.props(styles.col)}>
				<span>{localDateOf(s.startUtc)}</span>
				<span {...stylex.props(styles.muted)}>{formatKwh(s.kWh)}</span>
			</span>
			<span {...stylex.props(styles.col, styles.right)}>
				<span>{total === null ? 'pending' : formatKr(total)}</span>
				{total !== null && s.kWh > 0 ? <span {...stylex.props(styles.muted)}>{`${formatKr(total / s.kWh)}/kWh`}</span> : null}
				{delta !== null ? (
					<span {...stylex.props(delta > 0 ? styles.bad : styles.good)}>
						{`${delta > 0 ? '+' : ''}${formatKr(delta)} vs plan`}
					</span>
				) : null}
			</span>
		</Link>
	);
};
