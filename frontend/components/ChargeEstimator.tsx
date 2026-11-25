'use client';

import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { estimateCharge, neededKwhFor } from '@shared/planner';
import { addHours, floorHourUtc, localDateOf, nextLocalTime } from '@shared/time';
import type { IsoUtc, MonthPeaks, PlanCandidate, PriceDay, Settings, Tariff } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { formatLocalTime } from '../lib/localTime';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

const HOUR_MS = 3_600_000;
const NOW = 'now';

type Power = 'best' | 'max' | 'reduced';

const styles = stylex.create({
	card: {
		display: 'flex',
		flexDirection: 'column',
		gap: 14,
		padding: 16,
		borderRadius: 20,
		backgroundColor: colors.surface,
	},
	title: {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		margin: 0,
		fontSize: 13,
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.04em',
		color: colors.muted,
	},
	controls: { display: 'flex', flexDirection: 'column', gap: 12 },
	row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
	label: { fontSize: 15, color: colors.ink },
	value: { fontSize: 15, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	sliderRow: { display: 'flex', flexDirection: 'column', gap: 4 },
	slider: { width: '100%', accentColor: colors.brand, margin: 0 },
	select: {
		minHeight: 32,
		paddingInline: 10,
		borderRadius: 8,
		borderWidth: 0,
		fontSize: 15,
		color: colors.ink,
		backgroundColor: tint.fill,
	},
	result: {
		display: 'flex',
		flexDirection: 'column',
		gap: 4,
		paddingTop: 12,
		borderTopWidth: 0.5,
		borderTopStyle: 'solid',
		borderTopColor: colors.line,
	},
	when: { fontSize: 13, color: colors.muted },
	window: {
		fontFamily: fonts.rounded,
		fontSize: 34,
		lineHeight: 1.1,
		fontWeight: 700,
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	detail: { fontSize: 15, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	tip: {
		marginTop: 6,
		paddingBlock: 10,
		paddingInline: 12,
		borderRadius: 12,
		fontSize: 15,
		color: colors.good,
		backgroundColor: tint.brand15,
	},
	note: { fontSize: 13, color: colors.muted },
	alert: { fontSize: 17, fontWeight: 600, color: colors.warn },
});

export interface ChargeWindow {
	start: IsoUtc;
	end: IsoUtc;
}

interface Props {
	now: IsoUtc;
	batteryPercent: number | null;
	settings: Settings;
	days: Record<string, PriceDay>;
	tariffs: Tariff[];
	peaksByMonth: Record<string, MonthPeaks>;
	/** The cheapest window for the current controls, for the price chart to highlight. */
	onWindow?: (w: ChargeWindow | null) => void;
}

const dayName = (iso: IsoUtc, now: IsoUtc): string => {
	const d = localDateOf(iso);
	if (d === localDateOf(now)) return 'Today';
	if (d === localDateOf(addHours(now, 24))) return 'Tomorrow';
	return d;
};
const hourLabel = (iso: IsoUtc, now: IsoUtc) => `${dayName(iso, now)} ${formatLocalTime(iso)}`;
const ore = (krPerKwh: number) => `${Math.round(krPerKwh * 100)} öre/kWh`;

/** End of the last hour with a published price, or null when nothing ahead is priced. */
function pricedUntil(now: IsoUtc, days: Record<string, PriceDay>): IsoUtc | null {
	let last: number | null = null;
	for (const d of Object.values(days)) {
		for (const q of d.quarters) {
			const t = Date.parse(q.start);
			if (last === null || t > last) last = t;
		}
	}
	if (last === null) return null;
	const end = Math.floor(last / HOUR_MS) * HOUR_MS + HOUR_MS;
	return end > Date.parse(now) ? new Date(end).toISOString() : null;
}

const hoursBetween = (fromMs: number, toMs: number): IsoUtc[] => {
	const out: IsoUtc[] = [];
	for (let t = fromMs; t <= toMs; t += HOUR_MS) out.push(new Date(t).toISOString());
	return out;
};

export const ChargeEstimator = ({ now, batteryPercent, settings, days, tariffs, peaksByMonth, onWindow }: Props) => {
	const [from, setFrom] = useState<number | null>(null);
	const [to, setTo] = useState<number | null>(null);
	const [start, setStart] = useState<string>(NOW);
	const [end, setEnd] = useState<string | null>(null);
	const [power, setPower] = useState<Power>('best');

	const fromPct = from ?? batteryPercent ?? 20;
	const toPct = to ?? settings.targetPercent;
	const nowHour = floorHourUtc(now);
	const until = pricedUntil(now, days);
	const defaultEnd = nextLocalTime(now, settings.readyBy);
	const startIso = start === NOW || Date.parse(start) < Date.parse(nowHour) ? nowHour : start;
	const endIso = end && Date.parse(end) > Date.parse(startIso) ? end : defaultEnd;

	// Start: now, then every whole hour while prices last. Ready by: every hour after the start.
	const nextHour = Date.parse(nowHour) + HOUR_MS;
	const lastMs = until ? Date.parse(until) : Date.parse(defaultEnd);
	const startOptions = hoursBetween(nextHour, lastMs - HOUR_MS);
	const endOptions = hoursBetween(Date.parse(startIso) + HOUR_MS, Math.max(lastMs, Date.parse(defaultEnd)));
	if (!endOptions.includes(endIso)) endOptions.push(endIso);
	endOptions.sort();

	const neededKwh = neededKwhFor(fromPct, toPct, settings);
	const reduced = settings.reducedKw < settings.chargerMaxKw ? settings.reducedKw : null;
	const kws =
		power === 'max' || !reduced
			? [settings.chargerMaxKw]
			: power === 'reduced'
				? [reduced]
				: [settings.chargerMaxKw, reduced];

	const est = useMemo(
		() => estimateCharge({ startUtc: startIso, endUtc: endIso, neededKwh, kws, days, tariffs, peaksByMonth }),
		// kws is derived from power and settings, both listed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[startIso, endIso, neededKwh, power, settings, days, tariffs, peaksByMonth]
	);
	const best = est.best;

	useEffect(() => {
		onWindow?.(best ? { start: best.start, end: best.end } : null);
	}, [best?.start, best?.end, onWindow]); // eslint-disable-line react-hooks/exhaustive-deps

	const powerOptions = [
		['best', 'Cheapest'],
		['max', `${settings.chargerMaxKw} kW`],
		...(reduced ? ([['reduced', `${reduced} kW`]] as const) : []),
	] as const;

	return (
		<section aria-label='Plan a charge' {...stylex.props(styles.card)}>
			<h2 {...stylex.props(styles.title)}>
				<Icon name='bolt' size={15} strokeWidth={1.6} />
				Plan a charge
			</h2>

			<div {...stylex.props(styles.controls)}>
				<label {...stylex.props(styles.sliderRow)}>
					<span {...stylex.props(styles.row)}>
						<span {...stylex.props(styles.label)}>Battery now</span>
						<span {...stylex.props(styles.value)}>{fromPct}%</span>
					</span>
					<input
						type='range'
						min={0}
						max={100}
						value={fromPct}
						aria-label='Battery now'
						onChange={e => setFrom(Number(e.target.value))}
						{...stylex.props(styles.slider)}
					/>
				</label>
				<label {...stylex.props(styles.sliderRow)}>
					<span {...stylex.props(styles.row)}>
						<span {...stylex.props(styles.label)}>Charge to</span>
						<span {...stylex.props(styles.value)}>{toPct}%</span>
					</span>
					<input
						type='range'
						min={0}
						max={100}
						value={toPct}
						aria-label='Charge to'
						onChange={e => setTo(Number(e.target.value))}
						{...stylex.props(styles.slider)}
					/>
				</label>
				<label {...stylex.props(styles.row)}>
					<span {...stylex.props(styles.label)}>Plug in</span>
					<select
						aria-label='Plug in'
						value={start === NOW || !startOptions.includes(start) ? NOW : start}
						onChange={e => setStart(e.target.value)}
						{...stylex.props(styles.select)}
					>
						<option value={NOW}>Now</option>
						{startOptions.map(h => (
							<option key={h} value={h}>
								{hourLabel(h, now)}
							</option>
						))}
					</select>
				</label>
				<label {...stylex.props(styles.row)}>
					<span {...stylex.props(styles.label)}>Ready by</span>
					<select
						aria-label='Ready by'
						value={endIso}
						onChange={e => setEnd(e.target.value)}
						{...stylex.props(styles.select)}
					>
						{endOptions.map(h => (
							<option key={h} value={h}>
								{hourLabel(h, now)}
							</option>
						))}
					</select>
				</label>
				<div {...stylex.props(styles.row)}>
					<span {...stylex.props(styles.label)}>Power</span>
					<Segmented label='Charging power' options={powerOptions} value={power} onChange={setPower} />
				</div>
			</div>

			<div aria-live='polite' data-testid='estimate' {...stylex.props(styles.result)}>
				<Result neededKwh={neededKwh} now={now} est={est} until={until} fromNow={startIso === nowHour} />
			</div>
		</section>
	);
};

const Result = ({
	neededKwh,
	now,
	est,
	until,
	fromNow,
}: {
	fromNow: boolean;
	neededKwh: number;
	now: IsoUtc;
	est: ReturnType<typeof estimateCharge>;
	until: IsoUtc | null;
}) => {
	if (neededKwh <= 0) return <p {...stylex.props(styles.window)}>Already there</p>;
	if (!est.fits)
		return <p {...stylex.props(styles.alert)}>Not enough time — move “Ready by” later or plug in earlier</p>;
	const best = est.best;
	if (!best)
		return (
			<p {...stylex.props(styles.note)}>
				{until
					? `Prices are only out until ${hourLabel(until, now)} — pick a window before then`
					: 'No prices published for this window yet'}
			</p>
		);

	const saving = (other: PlanCandidate | null) => (other ? other.cost - best.cost : 0);
	const vsNow = saving(est.asap);
	const vsWorst = saving(est.worst);
	const plugIn = fromNow ? 'plugging in now' : `starting at ${formatLocalTime(est.asap?.start ?? best.start)}`;

	return (
		<>
			<span {...stylex.props(styles.when)}>Cheapest: {dayName(best.start, now)}</span>
			<p {...stylex.props(styles.window)}>
				{formatLocalTime(best.start)}–{formatLocalTime(best.end)}
			</p>
			<p {...stylex.props(styles.detail)}>
				{formatKwh(neededKwh)} at {best.kw} kW · {formatKr(best.cost)} · {ore(best.cost / neededKwh)}
			</p>
			{best.peakIncrease > 0.005 ? (
				<p {...stylex.props(styles.note)}>Includes {formatKr(best.peakIncrease)} extra peak fee this month</p>
			) : null}
			{est.asap && vsNow >= 0.5 ? (
				<p {...stylex.props(styles.tip)}>
					Saves {formatKr(vsNow)} vs {plugIn} ({formatKr(est.asap.cost)})
				</p>
			) : est.asap ? (
				<p {...stylex.props(styles.tip)}>Starting right away is about as cheap as it gets</p>
			) : null}
			{est.worst && vsWorst >= 0.5 ? (
				<p {...stylex.props(styles.note)}>
					The worst start ({formatLocalTime(est.worst.start)}) would cost {formatKr(est.worst.cost)}
				</p>
			) : null}
			{est.missingPrices && until ? (
				<p {...stylex.props(styles.note)}>
					Prices after {hourLabel(until, now)} aren’t out yet, so later hours are skipped
				</p>
			) : null}
		</>
	);
};
