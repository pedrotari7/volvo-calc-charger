'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import { formatAgo, formatKr, formatKwh } from '@shared/format';
import type { CarState, ChargerState } from '@shared/types';
import { celebrateOnce } from '../lib/confetti';
import { formatLocalTime } from '../lib/localTime';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { BatteryRing } from './BatteryRing';
import { Icon } from './Icon';

const pulse = stylex.keyframes({
	'0%, 100%': { opacity: 1 },
	'50%': { opacity: 0.45 },
});

// The glow behind a charging car drifts slowly across the card.
const drift = stylex.keyframes({
	'0%, 100%': { backgroundPosition: '100% 0%' },
	'50%': { backgroundPosition: '60% 40%' },
});

const styles = stylex.create({
	card: {
		padding: 20,
		borderRadius: 20,
		backgroundColor: colors.surface,
		display: 'flex',
		flexDirection: 'column',
		gap: 14,
		position: 'relative',
		overflow: 'hidden',
	},
	charging: {
		backgroundImage: `radial-gradient(80% 70% at center, ${tint.brand30}, transparent 70%)`,
		backgroundSize: '200% 200%',
		backgroundRepeat: 'no-repeat',
		animationName: drift,
		animationDuration: '7s',
		animationTimingFunction: 'ease-in-out',
		animationIterationCount: 'infinite',
	},
	ready: {
		backgroundImage: 'radial-gradient(120% 90% at 0% 0%, rgb(48 209 88 / 0.18), transparent 60%)',
	},
	top: { display: 'flex', alignItems: 'center', gap: 20 },
	facts: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minWidth: 0 },
	range: {
		fontFamily: fonts.rounded,
		fontSize: 22,
		fontWeight: 700,
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	pill: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 5,
		height: 28,
		paddingInline: 10,
		borderRadius: 14,
		fontSize: 13,
		fontWeight: 600,
		backgroundColor: tint.fill,
		color: colors.muted,
		whiteSpace: 'nowrap',
	},
	pillOn: { backgroundColor: tint.brand15, color: colors.brand },
	pillPlug: { backgroundColor: tint.info15, color: colors.info },
	pillReady: {
		color: '#04140a',
		backgroundImage: 'linear-gradient(135deg, #a6f56b, #30d158)',
		boxShadow: `0 4px 14px ${tint.brand30}`,
	},
	pulse: { animationName: pulse, animationDuration: '1.6s', animationIterationCount: 'infinite' },
	chip: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 15,
		color: colors.ink,
	},
	chipWarn: { color: colors.warn },
	live: {
		fontSize: 15,
		lineHeight: 1.45,
		color: colors.ink,
		paddingTop: 12,
		borderTopWidth: 0.5,
		borderTopStyle: 'solid',
		borderTopColor: colors.line,
		fontVariantNumeric: 'tabular-nums',
	},
	muted: { fontSize: 13, color: colors.faint },
});

interface Props {
	car: CarState | null;
	charger: ChargerState | null;
	now: string;
	// All-in kr/kWh including VAT for the current hour; null when unknown.
	rateNow: number | null;
	/** Charge target %, marked on the battery ring. */
	target?: number;
}

const ChargerPill = ({ charger, ready }: { charger: ChargerState | null; ready: boolean }) => {
	if (ready && !charger?.charging)
		return (
			<span {...stylex.props(styles.pill, styles.pillReady)}>
				<Icon name='check' size={14} strokeWidth={2.6} />
				Ready to roll
			</span>
		);
	if (!charger) return null;
	if (charger.charging)
		return (
			<span {...stylex.props(styles.pill, styles.pillOn)}>
				<Icon name='bolt' size={14} filled strokeWidth={1} {...stylex.props(styles.pulse)} />
				Charging
			</span>
		);
	if (charger.pluggedIn)
		return (
			<span {...stylex.props(styles.pill, styles.pillPlug)}>
				<Icon name='plug' size={14} strokeWidth={2} />
				Plugged in
			</span>
		);

	return <span {...stylex.props(styles.pill)}>Not plugged in</span>;
};

export const CarSummary = ({ car, charger, now, rateNow, target }: Props) => {
	const battery = car?.battery ?? null;
	const locked = car?.locked ?? null;
	const range = battery?.value.rangeKm;
	const estFullAt = battery?.value.estFullAt ?? null;
	const charging = charger?.charging === true;
	const percent = battery?.value.percent ?? null;
	const ready = percent !== null && target !== undefined && percent >= target;
	const card = useRef<HTMLElement>(null);

	// Reaching the target is worth a little party, once a day.
	useEffect(() => {
		if (!ready) return;
		const box = card.current?.getBoundingClientRect();
		celebrateOnce(`ready:${now.slice(0, 10)}`, box ? box.left + 82 : undefined, box ? box.top + 86 : undefined);
	}, [ready, now]);

	return (
		<section
			ref={card}
			aria-label='Car'
			{...stylex.props(styles.card, ready && styles.ready, charging && styles.charging)}
		>
			<div {...stylex.props(styles.top)}>
				<BatteryRing percent={percent} target={target} charging={charging} />
				<div {...stylex.props(styles.facts)}>
					<ChargerPill charger={charger} ready={ready} />
					<span {...stylex.props(styles.range)}>
						Range {range === null || range === undefined ? '–' : `${range} km`}
					</span>
					{locked ? (
						<span {...stylex.props(styles.chip, !locked.value && styles.chipWarn)}>
							<Icon name='lock' size={15} strokeWidth={2} />
							{locked.value ? 'Locked' : 'Not locked'}
						</span>
					) : null}
					{car ? <span {...stylex.props(styles.muted)}>Updated {formatAgo(car.updatedAt, now)}</span> : null}
				</div>
			</div>
			{charger?.charging ? (
				<p {...stylex.props(styles.live)}>
					{charger.liveKw.toFixed(1)} kW · {formatKwh(charger.sessionKwh)} ·{' '}
					{rateNow === null ? '–' : `≈ ${formatKr(rateNow * charger.sessionKwh)}`} so far (at the current
					hour&apos;s price)
					{estFullAt ? ` · full ${formatLocalTime(estFullAt)}` : ''}
				</p>
			) : null}
		</section>
	);
};
