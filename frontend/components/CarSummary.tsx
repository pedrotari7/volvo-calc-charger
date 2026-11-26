'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { formatAgo, formatKr, formatKwh } from '@shared/format';
import type { CarProfile, CarState, ChargerState } from '@shared/types';
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

const breathe = stylex.keyframes({
	'0%, 100%': { opacity: 0.45, transform: 'scaleX(0.9)' },
	'50%': { opacity: 1, transform: 'scaleX(1.05)' },
});

const arrive = stylex.keyframes({
	from: { opacity: 0, transform: 'translateX(-24px) scale(0.97)' },
	to: { opacity: 1, transform: 'none' },
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
	hero: { position: 'relative', marginInline: -8, marginTop: -4 },
	// The car stands on a soft pool of light: neutral parked, green and breathing while charging.
	floor: {
		position: 'absolute',
		left: '12%',
		right: '12%',
		bottom: '4%',
		height: '18%',
		borderRadius: '50%',
		backgroundImage: 'radial-gradient(closest-side, rgb(255 255 255 / 0.16), transparent)',
		filter: 'blur(6px)',
	},
	floorCharging: {
		backgroundImage: 'radial-gradient(closest-side, rgb(48 209 88 / 0.65), transparent)',
		animationName: breathe,
		animationDuration: '2.8s',
		animationTimingFunction: 'ease-in-out',
		animationIterationCount: 'infinite',
	},
	image: {
		position: 'relative',
		display: 'block',
		width: '100%',
		aspectRatio: '16 / 8',
		objectFit: 'contain',
		animationName: arrive,
		animationDuration: '700ms',
		animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
	},
	name: {
		display: 'flex',
		alignItems: 'baseline',
		gap: 8,
		fontSize: 13,
		fontWeight: 600,
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		color: colors.muted,
	},
	nameModel: { color: colors.ink, fontSize: 15, letterSpacing: '0.08em' },
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
	/** Model, paint and Volvo's picture of the car. */
	profile?: CarProfile | null;
}

/** Volvo's render of the car standing on a pool of light; nothing at all if there is no picture or it fails. */
const CarHero = ({ profile, charging }: { profile: CarProfile | null; charging: boolean }) => {
	const [failed, setFailed] = useState(false);
	const src = profile?.imageUrl ?? null;
	useEffect(() => setFailed(false), [src]);
	const name = [profile?.colour, profile?.modelYear].filter(Boolean).join(' · ');

	return (
		<>
			{src && !failed ? (
				<div {...stylex.props(styles.hero)}>
					<div aria-hidden {...stylex.props(styles.floor, charging && styles.floorCharging)} />
					{/* eslint-disable-next-line @next/next/no-img-element -- remote Volvo render, sized by the card */}
					<img
						src={src}
						alt={profile?.model ? `Volvo ${profile.model}` : 'The car'}
						referrerPolicy='no-referrer'
						decoding='async'
						onError={() => setFailed(true)}
						{...stylex.props(styles.image)}
					/>
				</div>
			) : null}
			{profile?.model ? (
				<p {...stylex.props(styles.name)}>
					<span {...stylex.props(styles.nameModel)}>Volvo {profile.model}</span>
					{name ? <span>{name}</span> : null}
				</p>
			) : null}
		</>
	);
};

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

export const CarSummary = ({ car, charger, now, rateNow, target, profile = null }: Props) => {
	const battery = car?.battery ?? null;
	const locked = car?.locked ?? null;
	const range = battery?.value.rangeKm;
	const estFullAt = battery?.value.estFullAt ?? null;
	const charging = charger?.charging === true;
	const percent = battery?.value.percent ?? null;
	const ready = percent !== null && target !== undefined && percent >= target;
	const ringRow = useRef<HTMLDivElement>(null);

	// Reaching the target is worth a little party, once a day.
	useEffect(() => {
		if (!ready) return;
		// From the middle of the battery ring (132px wide, first in its row).
		const box = ringRow.current?.getBoundingClientRect();
		celebrateOnce(
			`ready:${now.slice(0, 10)}`,
			box ? box.left + 66 : undefined,
			box ? box.top + box.height / 2 : undefined
		);
	}, [ready, now]);

	return (
		<section aria-label='Car' {...stylex.props(styles.card, ready && styles.ready, charging && styles.charging)}>
			<CarHero profile={profile} charging={charging} />
			<div ref={ringRow} {...stylex.props(styles.top)}>
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
