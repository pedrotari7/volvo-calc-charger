import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import type { Plan } from '@shared/types';
import { formatLocalTime } from '../lib/localTime';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	card: {
		padding: 16,
		borderRadius: 16,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: colors.line,
		display: 'flex',
		flexDirection: 'column',
		gap: 6,
	},
	title: { fontSize: 13, color: colors.muted },
	window: { fontSize: 28, fontWeight: 600, color: colors.ink },
	row: { fontSize: 15, color: colors.ink },
	tip: { fontSize: 14, color: colors.good },
	note: { fontSize: 13, color: colors.muted },
	alert: { fontSize: 17, fontWeight: 600, color: colors.warn },
});

const Body = ({ plan }: { plan: Plan }) => {
	const { recommendation: rec, alternative: alt } = plan;

	if (plan.neededKwh <= 0) return <p {...stylex.props(styles.row)}>Already at target</p>;
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
			{plan.basis === 'today' ? (
				<p {...stylex.props(styles.note)}>Prices for tomorrow not out yet</p>
			) : null}
		</>
	);
};

export const TonightCard = ({ plan }: { plan: Plan | null }) => (
	<section aria-label='Tonight' {...stylex.props(styles.card)}>
		<h2 {...stylex.props(styles.title)}>Tonight</h2>
		{plan ? <Body plan={plan} /> : <p {...stylex.props(styles.note)}>No plan yet</p>}
	</section>
);
