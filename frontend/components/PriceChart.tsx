'use client';

import * as stylex from '@stylexjs/stylex';
import { formatKr } from '@shared/format';
import { allInRateInclVat } from '@shared/pricing';
import { addHours, floorHourUtc, localDateOf, localParts } from '@shared/time';
import type { IsoUtc, PriceDay, Tariff } from '@shared/types';
import { useState } from 'react';
import { colors } from '../app/tokens.stylex';

const W = 340;
const H = 130;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const TICKS = [0, 6, 12, 18];

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 4 },
	readout: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
	readoutMain: { fontSize: 15, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' },
	readoutSub: { fontSize: 12, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	svg: { width: '100%', height: 'auto', display: 'block', touchAction: 'manipulation' },
	bar: { fill: colors.faint, cursor: 'pointer' },
	plan: { fill: colors.brand, cursor: 'pointer' },
	current: { stroke: colors.ink, strokeWidth: 1.5 },
	selected: { fill: colors.ink },
	grid: { stroke: colors.line, strokeWidth: 0.5, strokeDasharray: '2 2' },
	label: { fill: colors.muted, fontSize: 9 },
	tick: { fill: colors.faint, fontSize: 8 },
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
type PricedBar = Bar & { rate: number };

const nextDate = (iso: IsoUtc): string => localDateOf(addHours(iso, 24));
const hh = (iso: IsoUtc): string => String(localParts(iso).hour).padStart(2, '0');
const lowest = (bars: PricedBar[]) => bars.reduce((a, b) => (b.rate < a.rate ? b : a));
const highest = (bars: PricedBar[]) => bars.reduce((a, b) => (b.rate > a.rate ? b : a));

export const PriceChart = ({ days, tariffs, now, window: planWindow }: Props) => {
	const [picked, setPicked] = useState<IsoUtc | null>(null);
	const nowHour = floorHourUtc(now);
	const today = localDateOf(now);
	const tomorrow = nextDate(now);
	const bars: Bar[] = [];
	for (let i = -24; i < 72; i++) {
		const hour = addHours(nowHour, i);
		const d = localDateOf(hour);
		if (d === today || d === tomorrow) bars.push({ hour, rate: allInRateInclVat(hour, days, tariffs) });
	}
	const priced = bars.filter((b): b is PricedBar => b.rate !== null);
	if (priced.length === 0) return <p {...stylex.props(styles.empty)}>No prices yet</p>;

	const min = lowest(priced);
	const max = highest(priced);
	const label = `Price per kWh including VAT, today and tomorrow. Lowest ${formatKr(min.rate)} at ${hh(min.hour)}:00 on ${localDateOf(min.hour)}, highest ${formatKr(max.rate)} at ${hh(max.hour)}:00 on ${localDateOf(max.hour)}.`;

	const shown = priced.find(b => b.hour === (picked ?? nowHour)) ?? null;
	const shownLabel = shown
		? `${shown.hour === nowHour && !picked ? 'Now' : localDateOf(shown.hour) === today ? 'Today' : 'Tomorrow'} ${hh(shown.hour)}:00`
		: null;
	const todayBars = priced.filter(b => localDateOf(b.hour) === today);
	const tomorrowBars = priced.filter(b => localDateOf(b.hour) === tomorrow);
	const range = (name: string, list: PricedBar[]) =>
		list.length === 0
			? null
			: `${name} ${formatKr(lowest(list).rate).replace(' kr', '')}–${formatKr(highest(list).rate)} · cheapest ${hh(lowest(list).hour)}:00`;

	const slot = W / bars.length;
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const top = Math.max(max.rate, 0.01);
	const winStart = planWindow ? Date.parse(planWindow.start) : 0;
	const winEnd = planWindow ? Date.parse(planWindow.end) : 0;
	const firstTomorrow = bars.findIndex(b => localDateOf(b.hour) === tomorrow);

	return (
		<div {...stylex.props(styles.wrap)}>
			<div {...stylex.props(styles.readout)}>
				<span data-testid='price-readout' {...stylex.props(styles.readoutMain)}>
					{shown ? `${shownLabel} ${formatKr(shown.rate)}/kWh` : 'Tap a bar for its price'}
				</span>
			</div>
			<span data-testid='price-range' {...stylex.props(styles.readoutSub)}>
				{[range('Today', todayBars), range('Tomorrow', tomorrowBars)].filter(Boolean).join('  ·  ')}
			</span>
			<svg role='img' aria-label={label} viewBox={`0 0 ${W} ${H}`} {...stylex.props(styles.svg)}>
				<line x1={0} x2={W} y1={PAD_TOP} y2={PAD_TOP} {...stylex.props(styles.grid)} />
				<text x={W} y={PAD_TOP - 3} textAnchor='end' {...stylex.props(styles.tick)}>
					{formatKr(top)}
				</text>
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
							onClick={() => setPicked(p => (p === b.hour ? null : b.hour))}
							onPointerEnter={e => e.pointerType === 'mouse' && setPicked(b.hour)}
							{...stylex.props(
								inPlan ? styles.plan : styles.bar,
								picked === b.hour && styles.selected,
								isNow && styles.current
							)}
						/>
					);
				})}
				{bars.map((b, i) =>
					TICKS.includes(localParts(b.hour).hour) ? (
						<text
							key={`t${b.hour}`}
							x={i * slot + 0.5}
							y={PAD_TOP + plotH + 9}
							{...stylex.props(styles.tick)}
						>
							{hh(b.hour)}
						</text>
					) : null
				)}
				{[today, tomorrow].map(d => {
					const i = bars.findIndex(b => localDateOf(b.hour) === d);

					return i < 0 ? null : (
						<text key={d} x={i * slot + 0.5} y={H - 3} {...stylex.props(styles.label)}>
							{d === today ? 'Today' : 'Tomorrow'}
						</text>
					);
				})}
				{tomorrowBars.length === 0 && firstTomorrow >= 0 ? (
					<text x={firstTomorrow * slot + 6} y={PAD_TOP + plotH / 2} {...stylex.props(styles.label)}>
						Tomorrow&rsquo;s prices arrive around 13:00
					</text>
				) : null}
			</svg>
		</div>
	);
};
