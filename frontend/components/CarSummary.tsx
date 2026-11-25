import * as stylex from '@stylexjs/stylex';
import { formatAgo, formatKr, formatKwh } from '@shared/format';
import type { CarState, ChargerState } from '@shared/types';
import { formatLocalTime } from '../lib/localTime';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { BatteryBar } from './BatteryBar';
import { Icon } from './Icon';

const pulse = stylex.keyframes({
	'0%, 100%': { opacity: 1 },
	'50%': { opacity: 0.45 },
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
		backgroundImage: `radial-gradient(120% 90% at 100% 0%, ${tint.brand15}, transparent 60%)`,
	},
	top: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
	big: {
		fontFamily: fonts.rounded,
		fontSize: 56,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: '-0.02em',
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
	pulse: { animationName: pulse, animationDuration: '1.6s', animationIterationCount: 'infinite' },
	chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
	chip: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 15,
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.faint, alignSelf: 'center' },
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
}

const ChargerPill = ({ charger }: { charger: ChargerState }) => {
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

export const CarSummary = ({ car, charger, now, rateNow }: Props) => {
	const battery = car?.battery ?? null;
	const locked = car?.locked ?? null;
	const range = battery?.value.rangeKm;
	const estFullAt = battery?.value.estFullAt ?? null;

	return (
		<section aria-label='Car' {...stylex.props(styles.card, charger?.charging && styles.charging)}>
			<div {...stylex.props(styles.top)}>
				<p {...stylex.props(styles.big)}>{battery ? `${battery.value.percent} %` : '–'}</p>
				{charger ? <ChargerPill charger={charger} /> : null}
			</div>
			<BatteryBar percent={battery?.value.percent ?? 0} charging={charger?.charging === true} />
			<div {...stylex.props(styles.chips)}>
				<span {...stylex.props(styles.chip)}>
					Range {range === null || range === undefined ? '–' : `${range} km`}
				</span>
				{locked ? (
					<>
						<span {...stylex.props(styles.dot)} />
						<span {...stylex.props(styles.chip)}>
							<Icon name='lock' size={15} strokeWidth={2} />
							{locked.value ? 'Locked' : 'Not locked'}
						</span>
					</>
				) : null}
			</div>
			{charger?.charging ? (
				<p {...stylex.props(styles.live)}>
					{charger.liveKw.toFixed(1)} kW · {formatKwh(charger.sessionKwh)} ·{' '}
					{rateNow === null ? '–' : `≈ ${formatKr(rateNow * charger.sessionKwh)}`} so far (at the current
					hour&apos;s price)
					{estFullAt ? ` · full ${formatLocalTime(estFullAt)}` : ''}
				</p>
			) : null}
			{car ? <p {...stylex.props(styles.muted)}>Updated {formatAgo(car.updatedAt, now)}</p> : null}
		</section>
	);
};
