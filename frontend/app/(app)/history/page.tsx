'use client';

import * as stylex from '@stylexjs/stylex';
import { monthTotals } from '@shared/insights';
import { localDateOf, monthKey } from '@shared/time';
import { withDefaultSettings } from '@shared/types';
import type { CarState, MonthPeaks, PricedSession, Settings } from '@shared/types';
import { useMemo } from 'react';
import { MonthSummary } from '../../../components/MonthSummary';
import { SessionRow } from '../../../components/SessionRow';
import { useCollection } from '../../../lib/useCollection';
import { useDoc } from '../../../lib/useDoc';
import { Icon } from '../../../components/Icon';
import { Screen } from '../../../components/Screen';
import { Note } from '../../../components/Spinner';
import { colors, layout } from '../../tokens.stylex';

const styles = stylex.create({
	month: { display: 'flex', flexDirection: 'column', gap: 12 },
	sessions: {
		backgroundColor: colors.surface,
		borderRadius: layout.radius,
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	empty: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 10,
		paddingBlock: 64,
		fontSize: 17,
		color: colors.muted,
	},
	emptyIcon: { color: colors.faint },
});

/** kWh per day of `month`, by the local date of each charged hour (the session start when it has none). */
function dailyKwh(sessions: PricedSession[], month: string): number[] {
	const [y, m] = month.split('-').map(Number) as [number, number];
	const out = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, () => 0);
	for (const s of sessions) {
		const parts = s.hours.length
			? s.hours.map(h => [h.hourStartUtc, h.kWh] as const)
			: [[s.startUtc, s.kWh] as const];
		for (const [iso, kWh] of parts) {
			const d = localDateOf(iso);
			if (d.startsWith(month)) out[Number(d.slice(8)) - 1]! += kWh;
		}
	}
	return out;
}

interface OdometerDoc {
	km: number;
}

const HistoryPage = () => {
	const sessions = useCollection<PricedSession>('sessions');
	const odometer = useCollection<OdometerDoc>('odometer');
	const peaks = useCollection<MonthPeaks>('peaks');
	const settingsDoc = useDoc<Partial<Settings>>('config/settings');
	const car = useDoc<CarState>('car/state');
	const consumption = car.data?.trips?.value.averageEnergyConsumption ?? null;

	const settings = useMemo<Settings>(() => withDefaultSettings(settingsDoc.data), [settingsDoc.data]);
	const readings = useMemo(() => odometer.data.map(o => ({ km: o.km, date: o.id })), [odometer.data]);

	const groups = useMemo(() => {
		const byMonth = new Map<string, PricedSession[]>();
		for (const s of [...sessions.data].sort((a, b) => b.startUtc.localeCompare(a.startUtc))) {
			const m = monthKey(s.startUtc);
			byMonth.set(m, [...(byMonth.get(m) ?? []), s]);
		}
		return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
	}, [sessions.data]);

	if (sessions.error) {
		return (
			<Screen title='History'>
				<Note error>Couldn&rsquo;t load history</Note>
			</Screen>
		);
	}
	if (sessions.loading) {
		return (
			<Screen title='History'>
				<Note loading>Loading…</Note>
			</Screen>
		);
	}

	return (
		<Screen title='History'>
			{odometer.error || peaks.error ? <Note error>Some figures are unavailable</Note> : null}
			{groups.length === 0 ? (
				<div {...stylex.props(styles.empty)}>
					<Icon name='clock' size={48} strokeWidth={1.4} {...stylex.props(styles.emptyIcon)} />
					<p>No sessions yet</p>
				</div>
			) : null}
			{groups.map(([month, list]) => {
				const monthPeaks = peaks.data.find(p => p.id === month) ?? null;
				return (
					<div key={month} {...stylex.props(styles.month)}>
						<MonthSummary
							month={month}
							totals={monthTotals(list, month, readings, monthPeaks, settings, consumption)}
							final={monthPeaks?.final === true}
							daily={dailyKwh(list, month)}
						/>
						<div {...stylex.props(styles.sessions)}>
							{list.map(s => (
								<SessionRow key={s.id} session={s} />
							))}
						</div>
					</div>
				);
			})}
		</Screen>
	);
};

export default HistoryPage;
