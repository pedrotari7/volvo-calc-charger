'use client';

import * as stylex from '@stylexjs/stylex';
import { allInRateInclVat, quarterRatesInclVat } from '@shared/pricing';
import { addHours, floorHourUtc, localDateOf, localParts } from '@shared/time';
import type { IsoUtc, PriceDay, Tariff } from '@shared/types';
import { useEffect, useState } from 'react';
import { colors } from '../app/tokens.stylex';

const W = 340;
const H = 130;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const TICKS = [0, 6, 12, 18];
const QUARTER_MS = 15 * 60_000;
const MODE_KEY = 'priceChartMode';

type Mode = 'hour' | 'quarter';

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 4 },
	head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
	readoutMain: { fontSize: 15, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' },
	readoutSub: { fontSize: 12, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	toggle: {
		display: 'flex',
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: colors.line,
		borderRadius: 8,
		overflow: 'hidden',
		flexShrink: 0,
	},
	toggleBtn: {
		backgroundColor: 'transparent',
		color: colors.muted,
		borderWidth: 0,
		paddingBlock: 4,
		paddingInline: 10,
		fontSize: 12,
		cursor: 'pointer',
	},
	toggleOn: { backgroundColor: colors.raised, color: colors.ink },
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

interface Slot {
	start: IsoUtc;
	rate: number | null;
}
type PricedSlot = Slot & { rate: number };

const ore = (kr: number): string => `${Math.round(kr * 100)}`;
// Stockholm's UTC offset is whole hours, so UTC minutes are local minutes.
const hhmm = (iso: IsoUtc): string =>
	`${String(localParts(iso).hour).padStart(2, '0')}:${String(new Date(iso).getUTCMinutes()).padStart(2, '0')}`;
const lowest = (s: PricedSlot[]) => s.reduce((a, b) => (b.rate < a.rate ? b : a));
const highest = (s: PricedSlot[]) => s.reduce((a, b) => (b.rate > a.rate ? b : a));

const readMode = (): Mode => {
	try {
		return window.localStorage.getItem(MODE_KEY) === 'quarter' ? 'quarter' : 'hour';
	} catch {
		return 'hour';
	}
};

export const PriceChart = ({ days, tariffs, now, window: planWindow }: Props) => {
	const [mode, setMode] = useState<Mode>('hour');
	const [picked, setPicked] = useState<IsoUtc | null>(null);
	useEffect(() => setMode(readMode()), []);
	const choose = (m: Mode) => {
		setMode(m);
		setPicked(null);
		try {
			window.localStorage.setItem(MODE_KEY, m);
		} catch {
			// Per-device convenience only.
		}
	};

	const nowHour = floorHourUtc(now);
	const nowSlot =
		mode === 'hour' ? nowHour : new Date(Math.floor(Date.parse(now) / QUARTER_MS) * QUARTER_MS).toISOString();
	const today = localDateOf(now);
	const tomorrow = localDateOf(addHours(now, 24));

	const slots: Slot[] = [];
	for (let i = -24; i < 72; i++) {
		const hour = addHours(nowHour, i);
		const d = localDateOf(hour);
		if (d !== today && d !== tomorrow) continue;
		if (mode === 'hour') {
			slots.push({ start: hour, rate: allInRateInclVat(hour, days, tariffs) });
		} else {
			const q = new Map(quarterRatesInclVat(hour, days, tariffs).map(x => [x.start, x.rate]));
			for (let k = 0; k < 4; k++) {
				const start = new Date(Date.parse(hour) + k * QUARTER_MS).toISOString();
				slots.push({ start, rate: q.get(start) ?? null });
			}
		}
	}
	const priced = slots.filter((s): s is PricedSlot => s.rate !== null);
	if (priced.length === 0) return <p {...stylex.props(styles.empty)}>No prices yet</p>;

	const min = lowest(priced);
	const max = highest(priced);
	const label = `Price per kWh including VAT, today and tomorrow. Lowest ${ore(min.rate)} öre at ${hhmm(min.start)} on ${localDateOf(min.start)}, highest ${ore(max.rate)} öre at ${hhmm(max.start)} on ${localDateOf(max.start)}.`;

	const shown = priced.find(s => s.start === (picked ?? nowSlot)) ?? null;
	const shownName = !shown
		? ''
		: shown.start === nowSlot && !picked
			? 'Now'
			: localDateOf(shown.start) === today
				? 'Today'
				: 'Tomorrow';
	const todaySlots = priced.filter(s => localDateOf(s.start) === today);
	const tomorrowSlots = priced.filter(s => localDateOf(s.start) === tomorrow);
	const range = (name: string, list: PricedSlot[]) =>
		list.length === 0
			? null
			: `${name} ${ore(lowest(list).rate)}–${ore(highest(list).rate)} öre · cheapest ${hhmm(lowest(list).start)}`;

	const slotW = W / slots.length;
	const gap = mode === 'hour' ? 1 : 0.4;
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const top = Math.max(max.rate, 0.01);
	const winStart = planWindow ? Date.parse(planWindow.start) : 0;
	const winEnd = planWindow ? Date.parse(planWindow.end) : 0;
	const firstTomorrow = slots.findIndex(s => localDateOf(s.start) === tomorrow);

	return (
		<div {...stylex.props(styles.wrap)}>
			<div {...stylex.props(styles.head)}>
				<span data-testid='price-readout' {...stylex.props(styles.readoutMain)}>
					{shown ? `${shownName} ${hhmm(shown.start)} ${ore(shown.rate)} öre/kWh` : 'Tap a bar for its price'}
				</span>
				<div role='group' aria-label='Price resolution' {...stylex.props(styles.toggle)}>
					{(
						[
							['hour', '1 h'],
							['quarter', '15 min'],
						] as const
					).map(([m, text]) => (
						<button
							key={m}
							type='button'
							aria-pressed={mode === m}
							onClick={() => choose(m)}
							{...stylex.props(styles.toggleBtn, mode === m && styles.toggleOn)}
						>
							{text}
						</button>
					))}
				</div>
			</div>
			<span data-testid='price-range' {...stylex.props(styles.readoutSub)}>
				{[range('Today', todaySlots), range('Tomorrow', tomorrowSlots)].filter(Boolean).join('  ·  ')}
			</span>
			<svg role='img' aria-label={label} viewBox={`0 0 ${W} ${H}`} {...stylex.props(styles.svg)}>
				<line x1={0} x2={W} y1={PAD_TOP} y2={PAD_TOP} {...stylex.props(styles.grid)} />
				<text x={W - 2} y={PAD_TOP - 3} textAnchor='end' {...stylex.props(styles.tick)}>
					{ore(top)} öre
				</text>
				{slots.map((s, i) => {
					if (s.rate === null) return null;
					const h = Math.max(1, (Math.max(s.rate, 0) / top) * plotH);
					const t = Date.parse(s.start);
					const inPlan = planWindow !== null && t >= winStart && t < winEnd;
					const isNow = s.start === nowSlot;

					return (
						<rect
							key={s.start}
							data-plan={inPlan ? 'true' : undefined}
							data-now={isNow ? 'true' : undefined}
							x={i * slotW + gap / 2}
							y={PAD_TOP + plotH - h}
							width={Math.max(slotW - gap, 0.5)}
							height={h}
							rx={mode === 'hour' ? 1.5 : 0.5}
							onClick={() => setPicked(p => (p === s.start ? null : s.start))}
							onPointerEnter={e => e.pointerType === 'mouse' && setPicked(s.start)}
							{...stylex.props(
								inPlan ? styles.plan : styles.bar,
								picked === s.start && styles.selected,
								isNow && styles.current
							)}
						/>
					);
				})}
				{slots.map((s, i) =>
					TICKS.includes(localParts(s.start).hour) && new Date(s.start).getUTCMinutes() === 0 ? (
						<text
							key={`t${s.start}`}
							x={i * slotW + 0.5}
							y={PAD_TOP + plotH + 9}
							{...stylex.props(styles.tick)}
						>
							{String(localParts(s.start).hour).padStart(2, '0')}
						</text>
					) : null
				)}
				{[today, tomorrow].map(d => {
					const i = slots.findIndex(s => localDateOf(s.start) === d);

					return i < 0 ? null : (
						<text key={d} x={i * slotW + 0.5} y={H - 3} {...stylex.props(styles.label)}>
							{d === today ? 'Today' : 'Tomorrow'}
						</text>
					);
				})}
				{tomorrowSlots.length === 0 && firstTomorrow >= 0 ? (
					<text
						x={(firstTomorrow * slotW + W) / 2}
						y={PAD_TOP + plotH / 2}
						textAnchor='middle'
						{...stylex.props(styles.label)}
					>
						Prices from ~13:00
					</text>
				) : null}
			</svg>
		</div>
	);
};
