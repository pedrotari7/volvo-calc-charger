'use client';

import * as stylex from '@stylexjs/stylex';
import type { MouseEvent } from 'react';
import { formatKr, formatKwh } from '@shared/format';
import type { MonthTotals } from '@shared/insights';
import { chart, colors, fonts, tint } from '../app/tokens.stylex';
import { burstConfetti } from '../lib/confetti';
import { formatMonth } from '../lib/localTime';
import { useCountUp } from '../lib/useCountUp';

// What a cinnamon bun costs at the bakery, for turning savings into something you can eat.
const BULLE_KR = 35;

// Tiles are narrow: whole kronor, with the minus as a real minus sign, and never split from "kr".
const tileKr = (n: number): string => `${Math.round(n).toLocaleString('sv-SE')}\u00a0kr`;

const grow = stylex.keyframes({
	from: { transform: 'scaleY(0)' },
	to: { transform: 'scaleY(1)' },
});

const styles = stylex.create({
	card: {
		display: 'flex',
		flexDirection: 'column',
		gap: 14,
		padding: 20,
		borderRadius: 20,
		backgroundColor: colors.surface,
		backgroundImage: 'radial-gradient(100% 60% at 100% 0%, rgb(125 122 255 / 0.12), transparent 60%)',
	},
	month: {
		margin: 0,
		fontSize: 13,
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.04em',
		color: colors.muted,
	},
	hero: { display: 'flex', flexDirection: 'column', gap: 2 },
	total: {
		fontFamily: fonts.rounded,
		fontSize: 44,
		lineHeight: 1.05,
		fontWeight: 700,
		letterSpacing: '-0.02em',
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	sub: { fontSize: 15, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	split: { display: 'flex', gap: 2, height: 12 },
	seg: { borderRadius: 4, minWidth: 4 },
	energy: { backgroundColor: chart.energy },
	peak: { backgroundColor: chart.peak },
	empty: { flexGrow: 1, borderRadius: 4, backgroundColor: chart.track },
	legend: { display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 4, fontSize: 13, color: colors.muted },
	key: { display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' },
	swatch: { width: 10, height: 10, borderRadius: 3 },
	keyValue: { color: colors.ink },
	tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
	tile: {
		display: 'flex',
		flexDirection: 'column',
		gap: 2,
		padding: 12,
		borderRadius: 14,
		backgroundColor: tint.white5,
		minWidth: 0,
	},
	tileButton: {
		textAlign: 'left',
		transform: { default: 'none', ':active': 'scale(0.95)' },
		transitionProperty: 'transform',
		transitionDuration: '150ms',
	},
	tileGood: {
		backgroundImage: 'linear-gradient(160deg, rgb(48 209 88 / 0.2), rgb(48 209 88 / 0.04))',
	},
	tileValue: {
		fontFamily: fonts.rounded,
		fontSize: 16,
		lineHeight: 1.2,
		fontWeight: 700,
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
		whiteSpace: 'nowrap',
	},
	good: { color: colors.good },
	fun: { fontSize: 14, color: colors.muted },
	funValue: { color: colors.ink, fontWeight: 600 },
	tileLabel: { fontSize: 12, color: colors.muted },
	days: { display: 'flex', alignItems: 'flex-end', gap: 2, height: 44 },
	day: {
		flexGrow: 1,
		flexBasis: 0,
		borderRadius: '3px 3px 1px 1px',
		backgroundColor: chart.track,
		minHeight: 2,
		transformOrigin: 'bottom',
		animationName: grow,
		animationDuration: '600ms',
		animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
		animationFillMode: 'both',
	},
	dayOn: { backgroundImage: `linear-gradient(180deg, #7ee88f, ${chart.energy})` },
	daysAxis: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.faint },
	pending: { fontSize: 13, color: colors.warn },
});

interface Props {
	month: string;
	totals: MonthTotals;
	final: boolean;
	/** kWh charged on each day of the month, index 0 = the 1st. */
	daily?: number[];
}

interface TileProps {
	value: string;
	label: string;
	good?: boolean;
	onPress?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const Tile = ({ value, label, good, onPress }: TileProps) => {
	const body = (
		<>
			<span {...stylex.props(styles.tileValue, good && styles.good)}>{value}</span>
			<span {...stylex.props(styles.tileLabel)}>{label}</span>
		</>
	);
	return onPress ? (
		<button
			type='button'
			onClick={onPress}
			{...stylex.props(styles.tile, styles.tileButton, good && styles.tileGood)}
		>
			{body}
		</button>
	) : (
		<div {...stylex.props(styles.tile, good && styles.tileGood)}>{body}</div>
	);
};

export const MonthSummary = ({ month, totals: t, final, daily }: Props) => {
	const total = useCountUp(t.cost);
	const peak = t.peakFee ?? 0;
	const peakLabel = final ? 'Peak fee' : 'Peak fee (estimate)';
	const maxDay = Math.max(0, ...(daily ?? []));
	// Km from the energy charged and the car's average consumption rather than the odometer.
	const approx = t.kmEstimated ? '≈\u00a0' : '';
	const saved = t.saving !== null && t.saving > 0;
	const bullar = saved ? Math.floor(t.saving! / BULLE_KR) : 0;
	const celebrate = (e: MouseEvent<HTMLButtonElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		burstConfetti(box.left + box.width / 2, box.top + box.height / 2);
	};

	return (
		<section aria-label={`Summary ${month}`} {...stylex.props(styles.card)}>
			<h2 {...stylex.props(styles.month)}>{formatMonth(month)}</h2>
			<div {...stylex.props(styles.hero)}>
				<span {...stylex.props(styles.total)}>
					{t.cost === 0 && t.pendingCount > 0 ? '–' : formatKr(total)}
				</span>
				<span {...stylex.props(styles.sub)}>{formatKwh(t.kWh)} charged at home</span>
			</div>

			<div role='img' aria-label={`Energy ${formatKr(t.energyCost)}, ${peakLabel} ${formatKr(peak)}`}>
				<div {...stylex.props(styles.split)}>
					{t.cost > 0 ? (
						<>
							{t.energyCost > 0 ? (
								<span style={{ flexGrow: t.energyCost }} {...stylex.props(styles.seg, styles.energy)} />
							) : null}
							{peak > 0 ? (
								<span style={{ flexGrow: peak }} {...stylex.props(styles.seg, styles.peak)} />
							) : null}
						</>
					) : (
						<span {...stylex.props(styles.empty)} />
					)}
				</div>
			</div>
			<div {...stylex.props(styles.legend)}>
				<span {...stylex.props(styles.key)}>
					<span {...stylex.props(styles.swatch, styles.energy)} />
					Energy{' '}
					<span {...stylex.props(styles.keyValue)}>
						{t.energyCost === 0 && t.pendingCount > 0 ? 'pending' : formatKr(t.energyCost)}
					</span>
				</span>
				<span {...stylex.props(styles.key)}>
					<span {...stylex.props(styles.swatch, styles.peak)} />
					{peakLabel}{' '}
					<span {...stylex.props(styles.keyValue)}>{t.peakFee === null ? '–' : formatKr(peak)}</span>
				</span>
			</div>

			<div {...stylex.props(styles.tiles)}>
				<Tile
					value={t.energyKrPerKwh === null ? '–' : `${Math.round(t.energyKrPerKwh * 100)} öre`}
					label='Energy per kWh'
				/>
				<Tile value={t.krPer100km === null ? '–' : `${approx}${tileKr(t.krPer100km)}`} label='Per 100 km' />
				<Tile
					value={t.saving === null ? '–' : `${approx}${tileKr(t.saving)}`}
					label={t.petrolCost === null ? 'Saved vs petrol' : `Saved vs petrol (${formatKr(t.petrolCost)})`}
					good={saved}
					onPress={saved ? celebrate : undefined}
				/>
			</div>
			{bullar > 0 ? (
				<p {...stylex.props(styles.fun)}>
					That&rsquo;s about{' '}
					<span {...stylex.props(styles.funValue)}>
						{bullar} {bullar === 1 ? 'kanelbulle' : 'kanelbullar'}
					</span>{' '}
					not spent on petrol 🥐
				</p>
			) : null}

			{daily && maxDay > 0 ? (
				<div>
					<div role='img' aria-label='Energy charged per day' {...stylex.props(styles.days)}>
						{daily.map((kWh, i) => (
							<span
								key={i}
								title={`${i + 1}: ${formatKwh(kWh)}`}
								style={{
									height: `${Math.max(4, (kWh / maxDay) * 100)}%`,
									animationDelay: `${i * 15}ms`,
								}}
								{...stylex.props(styles.day, kWh > 0 && styles.dayOn)}
							/>
						))}
					</div>
					<div {...stylex.props(styles.daysAxis)} aria-hidden>
						<span>1</span>
						<span>{daily.length}</span>
					</div>
				</div>
			) : null}

			{t.pendingCount > 0 ? (
				<span {...stylex.props(styles.pending)}>{t.pendingCount} pending — prices not in yet</span>
			) : null}
		</section>
	);
};
