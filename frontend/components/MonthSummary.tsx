import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import type { MonthTotals } from '@shared/insights';
import { colors } from '../app/tokens.stylex';
import { StatusRow } from './StatusRow';

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
		gap: 8,
	},
	title: { fontSize: 16, fontWeight: 600, color: colors.ink },
});

const orDash = (n: number | null, fmt: (n: number) => string) => (n === null ? '–' : fmt(n));

interface Props {
	month: string;
	totals: MonthTotals;
	final: boolean;
}

export const MonthSummary = ({ month, totals: t, final }: Props) => (
	<section aria-label={`Summary ${month}`} {...stylex.props(styles.card)}>
		<h2 {...stylex.props(styles.title)}>{month}</h2>
		<StatusRow label='Energy' value={formatKwh(t.kWh)} />
		<StatusRow label='Cost' value={formatKr(t.cost)} />
		<StatusRow label='Average' value={orDash(t.avgKrPerKwh, n => `${formatKr(n)}/kWh`)} />
		<StatusRow label='Per 100 km' value={orDash(t.krPer100km, formatKr)} />
		<StatusRow label='Petrol cost' value={orDash(t.petrolCost, formatKr)} />
		<StatusRow
			label='Saving'
			value={orDash(t.saving, formatKr)}
			tone={t.saving !== null && t.saving > 0 ? 'good' : undefined}
		/>
		<StatusRow label={final ? 'Peak fee' : 'Peak fee (estimate)'} value={orDash(t.peakFee, formatKr)} />
		{t.pendingCount > 0 ? <StatusRow label='Sessions' value={`${t.pendingCount} pending`} /> : null}
	</section>
);
