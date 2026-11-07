'use client';

import * as stylex from '@stylexjs/stylex';
import { monthTotals } from '@shared/insights';
import { monthKey } from '@shared/time';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { MonthPeaks, PricedSession, Settings } from '@shared/types';
import { useMemo } from 'react';
import { MonthSummary } from '../../../components/MonthSummary';
import { SessionRow } from '../../../components/SessionRow';
import { useCollection } from '../../../lib/useCollection';
import { useDoc } from '../../../lib/useDoc';
import { colors } from '../../tokens.stylex';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, marginInline: 'auto' },
	group: { display: 'flex', flexDirection: 'column', gap: 8 },
	note: { fontSize: 13, color: colors.muted },
	error: { fontSize: 13, color: colors.bad },
});

interface OdometerDoc {
	km: number;
}

const HistoryPage = () => {
	const sessions = useCollection<PricedSession>('sessions');
	const odometer = useCollection<OdometerDoc>('odometer');
	const peaks = useCollection<MonthPeaks>('peaks');
	const settingsDoc = useDoc<Partial<Settings>>('config/settings');

	const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...settingsDoc.data }), [settingsDoc.data]);
	const readings = useMemo(() => odometer.data.map((o) => ({ km: o.km, date: o.id })), [odometer.data]);

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
			<main {...stylex.props(styles.page)}>
				<p role='alert' {...stylex.props(styles.error)}>
					Couldn&rsquo;t load history
				</p>
			</main>
		);
	}
	if (sessions.loading) {
		return (
			<main {...stylex.props(styles.page)}>
				<p role='status' {...stylex.props(styles.note)}>
					Loading…
				</p>
			</main>
		);
	}

	return (
		<main {...stylex.props(styles.page)}>
			{odometer.error || peaks.error ? (
				<p role='alert' {...stylex.props(styles.error)}>
					Some figures are unavailable
				</p>
			) : null}
			{groups.length === 0 ? <p {...stylex.props(styles.note)}>No sessions yet</p> : null}
			{groups.map(([month, list]) => {
				const monthPeaks = peaks.data.find((p) => p.id === month) ?? null;
				return (
					<div key={month} {...stylex.props(styles.group)}>
						<MonthSummary
							month={month}
							totals={monthTotals(list, month, readings, monthPeaks, settings)}
							final={monthPeaks?.final === true}
						/>
						{list.map((s) => (
							<SessionRow key={s.id} session={s} />
						))}
					</div>
				);
			})}
		</main>
	);
};

export default HistoryPage;
