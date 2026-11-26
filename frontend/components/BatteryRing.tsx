'use client';

import * as stylex from '@stylexjs/stylex';
import { colors, fonts } from '../app/tokens.stylex';
import { useCountUp } from '../lib/useCountUp';

const SIZE = 132;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

const sweep = stylex.keyframes({
	'0%': { strokeDashoffset: 0 },
	// One circumference: 2π × 60.
	'100%': { strokeDashoffset: -377 },
});

const styles = stylex.create({
	wrap: { position: 'relative', width: 132, height: 132, flexShrink: 0 },
	svg: { display: 'block', transform: 'rotate(-90deg)' },
	track: { stroke: 'rgb(118 118 128 / 0.24)' },
	fill: {
		stroke: colors.brand,
		transitionProperty: 'stroke-dasharray',
		transitionDuration: '0.8s',
		transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
	},
	low: { stroke: colors.bad },
	// A bright dash circling the filled arc while charging.
	shimmer: {
		stroke: 'rgb(255 255 255 / 0.55)',
		animationName: sweep,
		animationDuration: '2.4s',
		animationTimingFunction: 'linear',
		animationIterationCount: 'infinite',
	},
	target: { stroke: colors.ink, strokeLinecap: 'round' },
	center: {
		position: 'absolute',
		inset: 0,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
	},
	value: {
		fontFamily: fonts.rounded,
		fontSize: 34,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: '-0.02em',
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	sub: { fontSize: 12, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
});

interface Props {
	percent: number | null;
	/** Charge target, drawn as a tick on the ring. */
	target?: number;
	charging?: boolean;
}

/** The car's battery as a ring, with the charge target marked. */
export const BatteryRing = ({ percent, target, charging = false }: Props) => {
	const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
	const shown = useCountUp(p);
	const arc = (shown / 100) * C;
	const angle = target === undefined ? null : (Math.max(0, Math.min(100, target)) / 100) * 2 * Math.PI;
	const mid = SIZE / 2;
	const tick =
		angle === null
			? null
			: {
					x1: mid + (R - STROKE / 2 - 3) * Math.cos(angle),
					y1: mid + (R - STROKE / 2 - 3) * Math.sin(angle),
					x2: mid + (R + STROKE / 2 + 3) * Math.cos(angle),
					y2: mid + (R + STROKE / 2 + 3) * Math.sin(angle),
				};

	return (
		<div
			role='meter'
			aria-label='Battery'
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={p}
			{...stylex.props(styles.wrap)}
		>
			<svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden {...stylex.props(styles.svg)}>
				<circle cx={mid} cy={mid} r={R} fill='none' strokeWidth={STROKE} {...stylex.props(styles.track)} />
				{percent !== null ? (
					<circle
						cx={mid}
						cy={mid}
						r={R}
						fill='none'
						strokeWidth={STROKE}
						strokeLinecap='round'
						strokeDasharray={`${arc} ${C}`}
						{...stylex.props(styles.fill, p < 20 && styles.low)}
					/>
				) : null}
				{charging && percent !== null ? (
					<circle
						cx={mid}
						cy={mid}
						r={R}
						fill='none'
						strokeWidth={STROKE - 6}
						strokeLinecap='round'
						strokeDasharray={`${Math.min(14, arc)} ${C}`}
						{...stylex.props(styles.shimmer)}
					/>
				) : null}
				{tick ? <line {...tick} strokeWidth={3} {...stylex.props(styles.target)} /> : null}
			</svg>
			<div {...stylex.props(styles.center)}>
				<span {...stylex.props(styles.value)}>{percent === null ? '–' : `${Math.round(shown)} %`}</span>
				{target !== undefined && percent !== null ? (
					<span {...stylex.props(styles.sub)}>target {target} %</span>
				) : null}
			</div>
		</div>
	);
};
