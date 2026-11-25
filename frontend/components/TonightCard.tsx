import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import type { Plan } from '@shared/types';
import { formatLocalTime } from '../lib/localTime';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';

const styles = stylex.create({
	card: {
		padding: 20,
		borderRadius: 20,
		backgroundColor: colors.surface,
		backgroundImage: 'radial-gradient(110% 80% at 0% 0%, rgb(94 92 230 / 0.22), transparent 60%)',
		display: 'flex',
		flexDirection: 'column',
		gap: 6,
	},
	title: {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 13,
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.04em',
		color: '#a5a3ff',
		marginBottom: 4,
	},
	window: {
		fontFamily: fonts.rounded,
		fontSize: 40,
		lineHeight: 1.1,
		fontWeight: 700,
		letterSpacing: '-0.01em',
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	row: { fontSize: 17, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	tip: {
		marginTop: 8,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		paddingBlock: 10,
		paddingInline: 12,
		borderRadius: 12,
		fontSize: 15,
		color: colors.good,
		backgroundColor: tint.brand15,
	},
	note: { fontSize: 15, color: colors.muted },
	alert: { fontSize: 20, lineHeight: 1.3, fontWeight: 600, color: colors.warn },
});

const Body = ({ plan }: { plan: Plan }) => {
	const { recommendation: rec, alternative: alt } = plan;

	if (plan.neededKwh <= 0) return <p {...stylex.props(styles.window)}>Already at target</p>;
	if (plan.chargeNow)
		return <p {...stylex.props(styles.alert)}>Plug in now — not enough time to wait for cheap hours</p>;
	if (!rec) return <p {...stylex.props(styles.note)}>Prices for tomorrow not out yet</p>;

	const saving = alt && alt.cost > rec.cost ? alt.cost - rec.cost : 0;

	return (
		<>
			<p {...stylex.props(styles.window)}>
				{formatLocalTime(rec.start)}–{formatLocalTime(rec.end)}
			</p>
			<p {...stylex.props(styles.row)}>
				{formatKwh(plan.neededKwh)} · {formatKr(rec.cost)}
			</p>
			{alt && saving > 0 ? (
				<p {...stylex.props(styles.tip)}>
					Charging at {rec.kw} kW instead of {alt.kw} kW saves {formatKr(saving)}
				</p>
			) : null}
			{plan.basis === 'today' ? <p {...stylex.props(styles.note)}>Prices for tomorrow not out yet</p> : null}
		</>
	);
};

export const TonightCard = ({ plan }: { plan: Plan | null }) => (
	<section aria-label='Tonight' {...stylex.props(styles.card)}>
		<h2 {...stylex.props(styles.title)}>
			<Icon name='moon' size={15} filled strokeWidth={1.4} />
			Tonight
		</h2>
		{plan ? <Body plan={plan} /> : <p {...stylex.props(styles.note)}>No plan yet</p>}
	</section>
);
