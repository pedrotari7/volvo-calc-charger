'use client';

import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { hourRateExVat } from '@shared/pricing';
import { localDateOf, localParts } from '@shared/time';
import type { PriceDay, PricedSession, Tariff } from '@shared/types';
import { documentId, where } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { HourBars } from '../../../../components/HourBars';
import { Group } from '../../../../components/List';
import { Screen } from '../../../../components/Screen';
import { Note } from '../../../../components/Spinner';
import { StatusRow } from '../../../../components/StatusRow';
import { formatDay } from '../../../../lib/localTime';
import { useCollection } from '../../../../lib/useCollection';
import { useDoc } from '../../../../lib/useDoc';
import { colors } from '../../../tokens.stylex';

const styles = stylex.create({
	scroll: { overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' },
	table: {
		borderCollapse: 'collapse',
		fontSize: 13,
		color: colors.ink,
		width: '100%',
		fontVariantNumeric: 'tabular-nums',
	},
	th: {
		textAlign: 'right',
		color: colors.muted,
		fontWeight: 500,
		fontSize: 12,
		paddingBlock: 10,
		paddingInline: 8,
		whiteSpace: 'nowrap',
		backgroundColor: colors.raised,
	},
	td: {
		textAlign: 'right',
		paddingBlock: 9,
		paddingInline: 8,
		whiteSpace: 'nowrap',
		borderTopWidth: 0.5,
		borderTopStyle: 'solid',
		borderTopColor: colors.line,
	},
	foot: { fontWeight: 700 },
	first: { textAlign: 'left', paddingLeft: 16 },
	last: { paddingRight: 16 },
});

// Money without the unit; the column header carries "kr".
const n2 = (n: number) => formatKr(n).replace(/ kr$/, '');
const hhmm = (iso: string) => `${String(localParts(iso).hour).padStart(2, '0')}:00`;

interface Row {
	key: string;
	hour: string;
	kWh: number;
	parts: { spot: number; markup: number; transfer: number; energyTax: number; vat: number; total: number } | null;
}

const COLS = ['Hour', 'kWh', 'Spot', 'Markup', 'Transfer', 'Tax', 'VAT', 'Total'];
const sum = (rows: Row[], k: 'spot' | 'markup' | 'transfer' | 'energyTax' | 'vat' | 'total') =>
	rows.reduce((a, r) => a + (r.parts?.[k] ?? 0), 0);

const SessionDetailPage = () => {
	const { id } = useParams<{ id: string }>();
	const session = useDoc<PricedSession>(`sessions/${id}`);
	const s = session.data;

	const dates = useMemo(() => (s ? [...new Set(s.hours.map(h => localDateOf(h.hourStartUtc)))] : []), [s]);
	const priceConstraints = useMemo(() => [where(documentId(), 'in', dates.length ? dates : ['none'])], [dates]);
	const prices = useCollection<PriceDay>('prices', priceConstraints, s !== null);
	const tariffs = useCollection<Tariff>('tariffs');

	const days = useMemo(() => Object.fromEntries(prices.data.map(d => [d.id, d])), [prices.data]);

	const rows = useMemo<Row[]>(
		() =>
			(s?.hours ?? []).map(h => {
				const r = hourRateExVat(h.hourStartUtc, days, tariffs.data);
				if (!r) return { key: h.hourStartUtc, hour: hhmm(h.hourStartUtc), kWh: h.kWh, parts: null };
				const spot = r.spot * h.kWh;
				const markup = r.markup * h.kWh;
				const transfer = r.transfer * h.kWh;
				const energyTax = r.energyTax * h.kWh;
				const vat = (spot + markup + transfer + energyTax) * r.tariff.vatRate;
				return {
					key: h.hourStartUtc,
					hour: hhmm(h.hourStartUtc),
					kWh: h.kWh,
					parts: {
						spot,
						markup,
						transfer,
						energyTax,
						vat,
						total: spot + markup + transfer + energyTax + vat,
					},
				};
			}),
		[s, days, tariffs.data]
	);

	const back = { href: '/history', label: 'History' };

	if (session.error) {
		return (
			<Screen title='Session' back={back}>
				<Note error>Couldn&rsquo;t load the session</Note>
			</Screen>
		);
	}
	if (session.loading) {
		return (
			<Screen title='Session' back={back}>
				<Note loading>Loading…</Note>
			</Screen>
		);
	}
	if (!s) {
		return (
			<Screen title='Session' back={back}>
				<Note>Session not found</Note>
			</Screen>
		);
	}

	const storedTotal = s.status === 'priced' && s.cost ? s.cost.total : null;
	const tableLoading = prices.loading || tariffs.loading;
	const tableError = prices.error || tariffs.error;
	const complete = rows.every(r => r.parts !== null);
	const recomputed = sum(rows, 'total');
	const differs = complete && storedTotal !== null && Math.abs(recomputed - storedTotal) > 0.01;

	return (
		<Screen title={formatDay(s.startUtc)} back={back}>
			<Group label='Session'>
				<StatusRow label='Energy' value={formatKwh(s.kWh)} />
				{storedTotal !== null ? (
					<StatusRow label='Total incl. VAT' value={formatKr(storedTotal)} />
				) : (
					<StatusRow label='Total' value='Price pending' />
				)}
			</Group>
			{tableError ? (
				<Note error>Couldn&rsquo;t load prices</Note>
			) : tableLoading ? (
				<Note loading>Loading…</Note>
			) : (
				<Group header='Per hour' footer={differs ? 'Breakdown uses current prices and tariffs' : undefined}>
					<HourBars rows={rows.map(r => ({ hour: r.hour, kWh: r.kWh, cost: r.parts?.total ?? null }))} />
					<div {...stylex.props(styles.scroll)}>
						<table aria-label='Cost per hour (kr, VAT separate)' {...stylex.props(styles.table)}>
							<thead>
								<tr>
									{COLS.map((c, i) => (
										<th
											key={c}
											scope='col'
											{...stylex.props(
												styles.th,
												i === 0 && styles.first,
												i === COLS.length - 1 && styles.last
											)}
										>
											{c}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map(r => (
									<tr key={r.key}>
										<td {...stylex.props(styles.td, styles.first)}>{r.hour}</td>
										<td {...stylex.props(styles.td)}>{formatKwh(r.kWh)}</td>
										{(['spot', 'markup', 'transfer', 'energyTax', 'vat', 'total'] as const).map(
											k => (
												<td key={k} {...stylex.props(styles.td, k === 'total' && styles.last)}>
													{r.parts ? n2(r.parts[k]) : '–'}
												</td>
											)
										)}
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<td {...stylex.props(styles.td, styles.foot, styles.first)}>Sum</td>
									<td {...stylex.props(styles.td, styles.foot)}>{formatKwh(s.kWh)}</td>
									{(['spot', 'markup', 'transfer', 'energyTax', 'vat', 'total'] as const).map(k => (
										<td
											key={k}
											{...stylex.props(styles.td, styles.foot, k === 'total' && styles.last)}
										>
											{complete ? n2(sum(rows, k)) : '–'}
										</td>
									))}
								</tr>
							</tfoot>
						</table>
					</div>
				</Group>
			)}
		</Screen>
	);
};

export default SessionDetailPage;
