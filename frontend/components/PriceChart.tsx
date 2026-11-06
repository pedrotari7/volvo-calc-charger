import * as stylex from '@stylexjs/stylex';
import { formatKr } from '@shared/format';
import { allInRateInclVat } from '@shared/pricing';
import { addHours, floorHourUtc, localDateOf, localParts } from '@shared/time';
import type { IsoUtc, PriceDay, Tariff } from '@shared/types';
import { colors } from '../app/tokens.stylex';

const W = 340;
const H = 120;
const PAD_TOP = 6;
const PAD_BOTTOM = 18;

const styles = stylex.create({
	svg: { width: '100%', height: 'auto', display: 'block' },
	bar: { fill: colors.faint },
	plan: { fill: colors.brand },
	current: { stroke: colors.ink, strokeWidth: 1.5 },
	label: { fill: colors.muted, fontSize: 9 },
	empty: { fontSize: 13, color: colors.muted },
});

interface Props {
	days: Record<string, PriceDay>;
	tariffs: Tariff[];
	now: IsoUtc;
	window: { start: IsoUtc; end: IsoUtc } | null;
}

interface Bar {
	hour: IsoUtc;
	rate: number | null;
}

const nextDate = (iso: IsoUtc): string => localDateOf(addHours(iso, 24));

export const PriceChart = ({ days, tariffs, now, window: planWindow }: Props) => {
	const nowHour = floorHourUtc(now);
	const today = localDateOf(now);
	const tomorrow = nextDate(now);
	const bars: Bar[] = [];
	for (let i = -24; i < 72; i++) {
		const hour = addHours(nowHour, i);
		const d = localDateOf(hour);
		if (d === today || d === tomorrow) bars.push({ hour, rate: allInRateInclVat(hour, days, tariffs) });
	}
	const priced = bars.filter((b): b is Bar & { rate: number } => b.rate !== null);
	if (priced.length === 0) return <p {...stylex.props(styles.empty)}>No prices yet</p>;

	const min = priced.reduce((a, b) => (b.rate < a.rate ? b : a));
	const max = priced.reduce((a, b) => (b.rate > a.rate ? b : a));
	const label = `Price per kWh including VAT, today and tomorrow. Lowest ${formatKr(min.rate)} at ${String(localParts(min.hour).hour).padStart(2, '0')}:00 on ${localDateOf(min.hour)}, highest ${formatKr(max.rate)} at ${String(localParts(max.hour).hour).padStart(2, '0')}:00 on ${localDateOf(max.hour)}.`;

	const slot = W / bars.length;
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const top = Math.max(max.rate, 0.01);
	const winStart = planWindow ? Date.parse(planWindow.start) : 0;
	const winEnd = planWindow ? Date.parse(planWindow.end) : 0;

	return (
		<svg role='img' aria-label={label} viewBox={`0 0 ${W} ${H}`} {...stylex.props(styles.svg)}>
			{bars.map((b, i) => {
				if (b.rate === null) return null;
				const h = Math.max(1, (Math.max(b.rate, 0) / top) * plotH);
				const t = Date.parse(b.hour);
				const inPlan = planWindow !== null && t >= winStart && t < winEnd;
				const isNow = b.hour === nowHour;

				return (
					<rect
						key={b.hour}
						data-plan={inPlan ? 'true' : undefined}
						data-now={isNow ? 'true' : undefined}
						x={i * slot + 0.5}
						y={PAD_TOP + plotH - h}
						width={Math.max(slot - 1, 1)}
						height={h}
						rx={1.5}
						{...stylex.props(inPlan ? styles.plan : styles.bar, isNow && styles.current)}
					/>
				);
			})}
			{[today, tomorrow].map((d) => {
				const i = bars.findIndex((b) => localDateOf(b.hour) === d);

				return i < 0 ? null : (
					<text key={d} x={i * slot + 1} y={H - 4} {...stylex.props(styles.label)}>
						{d === today ? 'Today' : 'Tomorrow'}
					</text>
				);
			})}
		</svg>
	);
};
