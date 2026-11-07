'use client';

import * as stylex from '@stylexjs/stylex';
import { allInRateInclVat, quarterRatesInclVat } from '@shared/pricing';
import { addHours, floorHourUtc, localDateOf, localParts } from '@shared/time';
import type { IsoUtc, PriceDay, Tariff } from '@shared/types';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { colors } from '../app/tokens.stylex';

const W = 340;
const H = 130;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;
const TICKS = [0, 6, 12, 18];
const QUARTER_MS = 15 * 60_000;
const MODE_KEY = 'priceChartMode';
const SPAN_KEY = 'priceChartSpan';

type Mode = 'hour' | 'quarter';
type Span = 'today' | 'tomorrow' | 'both';

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 4 },
	controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
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
	svg: {
		width: '100%',
		height: 'auto',
		display: 'block',
		touchAction: 'pan-y',
		userSelect: 'none',
		WebkitUserSelect: 'none',
	},
	bar: { fill: colors.faint, cursor: 'pointer' },
	plan: { fill: colors.brand, cursor: 'pointer' },
	current: { stroke: colors.ink, strokeWidth: 1.5 },
	selected: { fill: colors.ink },
	lowMark: { fill: colors.good, fontSize: 9, fontWeight: 600 },
	highMark: { fill: colors.bad, fontSize: 9, fontWeight: 600 },
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

const readStored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
	try {
		const v = window.localStorage.getItem(key);
		return allowed.find(a => a === v) ?? fallback;
	} catch {
		return fallback;
	}
};
const store = (key: string, value: string) => {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Per-device convenience only.
	}
};

const Segmented = <T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: readonly (readonly [T, string])[];
	value: T;
	onChange: (v: T) => void;
}) => (
	<div role='group' aria-label={label} {...stylex.props(styles.toggle)}>
		{options.map(([v, text]) => (
			<button
				key={v}
				type='button'
				aria-pressed={value === v}
				onClick={() => onChange(v)}
				{...stylex.props(styles.toggleBtn, value === v && styles.toggleOn)}
			>
				{text}
			</button>
		))}
	</div>
);

const MODES = [
	['hour', '1 h'],
	['quarter', '15 min'],
] as const;
const SPANS = [
	['today', 'Today'],
	['tomorrow', 'Tomorrow'],
	['both', 'Both'],
] as const;

export const PriceChart = ({ days, tariffs, now, window: planWindow }: Props) => {
	const [mode, setMode] = useState<Mode>('hour');
	const [span, setSpan] = useState<Span>('both');
	const [picked, setPicked] = useState<IsoUtc | null>(null);
	// Active touch/pen drag: where it started, and whether that bar was already focused (tap again clears).
	const drag = useRef<{ id: number; start: IsoUtc; wasPicked: boolean; moved: boolean } | null>(null);
	useEffect(() => {
		setMode(readStored<Mode>(MODE_KEY, ['hour', 'quarter'], 'hour'));
		setSpan(readStored<Span>(SPAN_KEY, ['today', 'tomorrow', 'both'], 'both'));
	}, []);
	const chooseMode = (m: Mode) => {
		setMode(m);
		setPicked(null);
		store(MODE_KEY, m);
	};
	const chooseSpan = (v: Span) => {
		setSpan(v);
		setPicked(null);
		store(SPAN_KEY, v);
	};

	const nowHour = floorHourUtc(now);
	const nowSlot =
		mode === 'hour' ? nowHour : new Date(Math.floor(Date.parse(now) / QUARTER_MS) * QUARTER_MS).toISOString();
	const today = localDateOf(now);
	const tomorrow = localDateOf(addHours(now, 24));
	const visible = span === 'both' ? [today, tomorrow] : [span === 'today' ? today : tomorrow];

	const slots: Slot[] = [];
	for (let i = -24; i < 72; i++) {
		const hour = addHours(nowHour, i);
		const d = localDateOf(hour);
		if (!visible.includes(d)) continue;
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
	if (priced.length === 0 && span !== 'tomorrow') return <p {...stylex.props(styles.empty)}>No prices yet</p>;

	const min = priced.length > 0 ? lowest(priced) : null;
	const max = priced.length > 0 ? highest(priced) : null;
	const which = span === 'both' ? 'today and tomorrow' : span;
	const label =
		min && max
			? `Price per kWh including VAT, ${which}. Lowest ${ore(min.rate)} öre at ${hhmm(min.start)} on ${localDateOf(min.start)}, highest ${ore(max.rate)} öre at ${hhmm(max.start)} on ${localDateOf(max.start)}.`
			: `Price per kWh including VAT, ${which}: not published yet.`;

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
	const top = Math.max(max?.rate ?? 0, 0.01);
	const winStart = planWindow ? Date.parse(planWindow.start) : 0;
	const winEnd = planWindow ? Date.parse(planWindow.end) : 0;
	const firstTomorrow = slots.findIndex(s => localDateOf(s.start) === tomorrow);
	// Slot under a screen x, snapped to the nearest bar that has a price.
	const slotAt = (e: ReactPointerEvent<SVGSVGElement>): IsoUtc | null => {
		const box = e.currentTarget.getBoundingClientRect();
		if (box.width <= 0) return null;
		const raw = Math.floor(((e.clientX - box.left) / box.width) * slots.length);
		const i = Math.min(Math.max(raw, 0), slots.length - 1);
		let best: Slot | null = null;
		for (let d = 0; d < slots.length && !best; d++) {
			for (const j of [i - d, i + d]) if (!best && slots[j]?.rate != null) best = slots[j]!;
		}
		return best?.start ?? null;
	};
	const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const s = slotAt(e);
		if (!s) return;
		e.currentTarget.setPointerCapture?.(e.pointerId);
		drag.current = { id: e.pointerId, start: s, wasPicked: picked === s, moved: false };
		setPicked(s);
	};
	const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
		const d = drag.current;
		if (!d && e.pointerType !== 'mouse') return;
		const s = slotAt(e);
		if (!s) return;
		if (d && s !== d.start) d.moved = true;
		setPicked(s);
	};
	const onUp = () => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved && d.wasPicked) setPicked(null);
	};
	const barH = (rate: number) => Math.max(1, (Math.max(rate, 0) / top) * plotH);
	const extremes: { kind: 'low' | 'high'; slot: PricedSlot }[] = [];
	for (const list of [todaySlots, tomorrowSlots]) {
		if (list.length === 0) continue;
		const lo = lowest(list);
		const hi = highest(list);
		extremes.push({ kind: 'low', slot: lo });
		if (hi.rate > lo.rate) extremes.push({ kind: 'high', slot: hi });
	}

	return (
		<div {...stylex.props(styles.wrap)}>
			<div {...stylex.props(styles.controls)}>
				<Segmented label='Days shown' options={SPANS} value={span} onChange={chooseSpan} />
				<Segmented label='Price resolution' options={MODES} value={mode} onChange={chooseMode} />
			</div>
			<span data-testid='price-readout' {...stylex.props(styles.readoutMain)}>
				{shown ? `${shownName} ${hhmm(shown.start)} ${ore(shown.rate)} öre/kWh` : 'Tap a bar for its price'}
			</span>
			<span data-testid='price-range' {...stylex.props(styles.readoutSub)}>
				{[range('Today', todaySlots), range('Tomorrow', tomorrowSlots)].filter(Boolean).join('  ·  ')}
			</span>
			<svg
				role='img'
				aria-label={label}
				viewBox={`0 0 ${W} ${H}`}
				onPointerDown={onDown}
				onPointerMove={onMove}
				onPointerUp={onUp}
				onPointerCancel={() => (drag.current = null)}
				{...stylex.props(styles.svg)}
			>
				{slots.map((s, i) => {
					if (s.rate === null) return null;
					const h = barH(s.rate);
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
							{...stylex.props(
								inPlan ? styles.plan : styles.bar,
								picked === s.start && styles.selected,
								isNow && styles.current
							)}
						/>
					);
				})}
				{extremes.map(({ kind, slot }) => {
					const i = slots.indexOf(slot);
					const cx = i * slotW + slotW / 2;
					const y = PAD_TOP + plotH - barH(slot.rate);

					return (
						<g key={`${kind}${slot.start}`} data-extreme={kind}>
							<circle
								cx={cx}
								cy={y - 4}
								r={2}
								{...stylex.props(kind === 'low' ? styles.lowMark : styles.highMark)}
							/>
							<text
								x={Math.min(Math.max(cx, 9), W - 9)}
								y={y - 9}
								textAnchor='middle'
								{...stylex.props(kind === 'low' ? styles.lowMark : styles.highMark)}
							>
								{ore(slot.rate)}
							</text>
						</g>
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
