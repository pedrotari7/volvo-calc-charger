import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { chart, colors } from '../app/tokens.stylex';

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 6, padding: 16 },
	plot: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 96 },
	col: {
		flexGrow: 1,
		flexBasis: 0,
		height: '100%',
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'flex-end',
		minWidth: 0,
		// A short session keeps slim bars rather than two wide blocks.
		maxWidth: 36,
	},
	bar: { borderRadius: '4px 4px 1px 1px', backgroundColor: chart.energy, minHeight: 2 },
	axis: {
		display: 'flex',
		justifyContent: 'center',
		gap: 2,
		fontSize: 11,
		color: colors.faint,
		fontVariantNumeric: 'tabular-nums',
	},
	tick: { flexGrow: 1, flexBasis: 0, textAlign: 'center', minWidth: 0, maxWidth: 36, overflow: 'hidden' },
	caption: { fontSize: 13, color: colors.muted },
});

export interface HourBar {
	hour: string;
	kWh: number;
	/** All-in cost of the hour incl. VAT, when priced. */
	cost: number | null;
}

/** kWh charged in each clock hour of a session; each bar's tooltip has its cost. */
export const HourBars = ({ rows }: { rows: HourBar[] }) => {
	const max = Math.max(0.001, ...rows.map(r => r.kWh));
	const peak = rows.reduce<HourBar | null>((b, r) => (!b || r.kWh > b.kWh ? r : b), null);
	// Label every hour when they fit, else every other one.
	const every = rows.length > 12 ? 2 : 1;

	return (
		<div {...stylex.props(styles.wrap)}>
			<div role='img' aria-label='Energy per hour' {...stylex.props(styles.plot)}>
				{rows.map((r, i) => (
					<span
						key={i}
						title={`${r.hour}: ${formatKwh(r.kWh)}${r.cost === null ? '' : ` · ${formatKr(r.cost)}`}`}
						{...stylex.props(styles.col)}
					>
						<span style={{ height: `${(r.kWh / max) * 100}%` }} {...stylex.props(styles.bar)} />
					</span>
				))}
			</div>
			<div {...stylex.props(styles.axis)} aria-hidden>
				{rows.map((r, i) => (
					<span key={i} {...stylex.props(styles.tick)}>
						{i % every === 0 ? r.hour.slice(0, 2) : ''}
					</span>
				))}
			</div>
			{peak ? (
				<span {...stylex.props(styles.caption)}>
					Busiest hour {peak.hour}: {formatKwh(peak.kWh)} (about {peak.kWh.toFixed(1)} kW)
				</span>
			) : null}
		</div>
	);
};
