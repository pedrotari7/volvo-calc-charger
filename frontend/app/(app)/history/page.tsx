'use client';

import * as stylex from '@stylexjs/stylex';
import { monthTotals } from '@shared/insights';
import { monthKey } from '@shared/time';
import { withDefaultSettings } from '@shared/types';
import type { MonthPeaks, PricedSession, Settings } from '@shared/types';
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

interface OdometerDoc {
	km: number;
}

const HistoryPage = () => {
	const sessions = useCollection<PricedSession>('sessions');
	const odometer = useCollection<OdometerDoc>('odometer');
	const peaks = useCollection<MonthPeaks>('peaks');
	const settingsDoc = useDoc<Partial<Settings>>('config/settings');

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
							totals={monthTotals(list, month, readings, monthPeaks, settings)}
							final={monthPeaks?.final === true}
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
