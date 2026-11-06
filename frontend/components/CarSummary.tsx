import * as stylex from '@stylexjs/stylex';
import { formatAgo, formatKr, formatKwh } from '@shared/format';
import type { CarState, ChargerState } from '@shared/types';
import { colors } from '../app/tokens.stylex';
import { BatteryBar } from './BatteryBar';

const styles = stylex.create({
	card: {
		padding: 16,
		borderRadius: 16,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: colors.line,
		display: 'flex',
		flexDirection: 'column',
		gap: 8,
	},
	big: { fontSize: 32, fontWeight: 600, color: colors.ink },
	row: { fontSize: 14, color: colors.ink },
	muted: { fontSize: 13, color: colors.muted },
	live: { fontSize: 14, color: colors.good },
});

interface Props {
	car: CarState | null;
	charger: ChargerState | null;
	now: string;
	// All-in kr/kWh including VAT for the current hour; null when unknown.
	rateNow: number | null;
}

export const CarSummary = ({ car, charger, now, rateNow }: Props) => {
	const battery = car?.battery ?? null;
	const locked = car?.locked ?? null;
	const range = battery?.value.rangeKm;
	const estFullAt = battery?.value.estFullAt ?? null;

	return (
		<section aria-label='Car' {...stylex.props(styles.card)}>
			<p {...stylex.props(styles.big)}>{battery ? `${battery.value.percent} %` : '–'}</p>
			<BatteryBar percent={battery?.value.percent ?? 0} />
			<p {...stylex.props(styles.row)}>
				Range {range === null || range === undefined ? '–' : `${range} km`}
				{locked ? ` · ${locked.value ? 'Locked' : 'Not locked'}` : ''}
			</p>
			{charger ? (
				<p {...stylex.props(styles.row)}>
					{charger.charging ? 'Charging' : charger.pluggedIn ? 'Plugged in' : 'Not plugged in'}
				</p>
			) : null}
			{charger?.charging ? (
				<p {...stylex.props(styles.live)}>
					{charger.liveKw.toFixed(1)} kW · {formatKwh(charger.sessionKwh)} ·{' '}
					{rateNow === null ? '–' : formatKr(rateNow * charger.sessionKwh)} so far
					{estFullAt ? ` · full ${new Date(estFullAt).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}` : ''}
				</p>
			) : null}
			{car ? <p {...stylex.props(styles.muted)}>Updated {formatAgo(car.updatedAt, now)}</p> : null}
		</section>
	);
};
