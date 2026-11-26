'use client';

import * as stylex from '@stylexjs/stylex';
import { useId } from 'react';
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

const breathe = stylex.keyframes({
	'0%, 100%': { opacity: 0.35, transform: 'scale(0.92)' },
	'50%': { opacity: 0.8, transform: 'scale(1.06)' },
});

const pop = stylex.keyframes({
	'0%': { transform: 'scale(1)' },
	'40%': { transform: 'scale(1.08)' },
	'100%': { transform: 'scale(1)' },
});

const styles = stylex.create({
	wrap: { position: 'relative', width: 132, height: 132, flexShrink: 0 },
	// A soft halo in the ring's colour; it breathes while charging.
	halo: {
		position: 'absolute',
		inset: 8,
		borderRadius: '50%',
		backgroundImage: 'radial-gradient(circle, rgb(48 209 88 / 0.35), transparent 70%)',
		filter: 'blur(14px)',
		opacity: 0.35,
	},
	haloLow: { backgroundImage: 'radial-gradient(circle, rgb(255 69 58 / 0.35), transparent 70%)' },
	haloCharging: {
		animationName: breathe,
		animationDuration: '2.8s',
		animationTimingFunction: 'ease-in-out',
		animationIterationCount: 'infinite',
	},
	reached: {
		animationName: pop,
		animationDuration: '700ms',
		animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
	},
	svg: { position: 'relative', display: 'block', transform: 'rotate(-90deg)', overflow: 'visible' },
	track: { stroke: 'rgb(118 118 128 / 0.24)' },
	fill: {
		filter: 'drop-shadow(0 0 6px rgb(48 209 88 / 0.45))',
		transitionProperty: 'stroke-dasharray',
		transitionDuration: '0.8s',
		transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
	},
	low: { filter: 'drop-shadow(0 0 6px rgb(255 69 58 / 0.45))' },
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
	const gradientId = useId();
	const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
	const low = p < 20;
	const atTarget = target !== undefined && percent !== null && p >= target;
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
			{...stylex.props(styles.wrap, atTarget && styles.reached)}
		>
			{percent !== null ? (
				<div {...stylex.props(styles.halo, low && styles.haloLow, charging && styles.haloCharging)} />
			) : null}
			<svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden {...stylex.props(styles.svg)}>
				<defs>
					<linearGradient id={gradientId} x1='0' y1='0' x2='1' y2='1'>
						<stop offset='0%' stopColor={low ? '#ff9f0a' : '#a6f56b'} />
						<stop offset='100%' stopColor={low ? '#ff453a' : '#30d158'} />
					</linearGradient>
				</defs>
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
						stroke={`url(#${gradientId})`}
						{...stylex.props(styles.fill, low && styles.low)}
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
