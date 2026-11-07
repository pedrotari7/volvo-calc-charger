'use client';

import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { hourRateExVat } from '@shared/pricing';
import { localDateOf, localParts } from '@shared/time';
import type { PriceDay, PricedSession, Tariff } from '@shared/types';
import { documentId, where } from 'firebase/firestore';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { StatusRow } from '../../../../components/StatusRow';
import { useCollection } from '../../../../lib/useCollection';
import { useDoc } from '../../../../lib/useDoc';
import { colors } from '../../../tokens.stylex';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, marginInline: 'auto' },
	header: { display: 'flex', alignItems: 'center', gap: 8 },
	back: { fontSize: 14, color: colors.info },
	title: { fontSize: 16, fontWeight: 600, color: colors.ink },
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
	scroll: { overflowX: 'auto', maxWidth: '100%' },
	table: { borderCollapse: 'collapse', fontSize: 12, color: colors.ink, width: '100%' },
	th: { textAlign: 'right', color: colors.muted, fontWeight: 400, paddingBlock: 6, paddingInline: 6, whiteSpace: 'nowrap' },
	td: { textAlign: 'right', paddingBlock: 6, paddingInline: 6, whiteSpace: 'nowrap', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: colors.line },
	foot: { fontWeight: 600 },
	note: { fontSize: 13, color: colors.muted },
	error: { fontSize: 13, color: colors.bad },
});

// Money without the unit; the column header carries "kr".
const n2 = (n: number) => formatKr(n).replace(/ kr$/, '');
const hhmm = (iso: string) => `${String(localParts(iso).hour).padStart(2, '0')}:00`;

interface Row {
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

	const dates = useMemo(() => (s ? [...new Set(s.hours.map((h) => localDateOf(h.hourStartUtc)))] : []), [s]);
	const priceConstraints = useMemo(() => [where(documentId(), 'in', dates.length ? dates : ['none'])], [dates]);
	const prices = useCollection<PriceDay>('prices', priceConstraints);
	const tariffs = useCollection<Tariff>('tariffs');

	const days = useMemo(() => Object.fromEntries(prices.data.map((d) => [d.id, d])), [prices.data]);

	const rows = useMemo<Row[]>(
		() =>
			(s?.hours ?? []).map((h) => {
				const r = hourRateExVat(h.hourStartUtc, days, tariffs.data);
				if (!r) return { hour: hhmm(h.hourStartUtc), kWh: h.kWh, parts: null };
				const spot = r.spot * h.kWh;
				const markup = r.markup * h.kWh;
				const transfer = r.transfer * h.kWh;
				const energyTax = r.energyTax * h.kWh;
				const vat = (spot + markup + transfer + energyTax) * r.tariff.vatRate;
				return { hour: hhmm(h.hourStartUtc), kWh: h.kWh, parts: { spot, markup, transfer, energyTax, vat, total: spot + markup + transfer + energyTax + vat } };
			}),
		[s, days, tariffs.data],
	);

	const header = (
		<div {...stylex.props(styles.header)}>
			<Link href='/history' {...stylex.props(styles.back)}>
				‹ History
			</Link>
		</div>
	);

	if (session.error || prices.error || tariffs.error) {
		return (
			<main {...stylex.props(styles.page)}>
				{header}
				<p role='alert' {...stylex.props(styles.error)}>
					{session.error ? 'Couldn’t load the session' : 'Couldn’t load prices'}
				</p>
			</main>
		);
	}
	if (session.loading || prices.loading || tariffs.loading) {
		return (
			<main {...stylex.props(styles.page)}>
				{header}
				<p role='status' {...stylex.props(styles.note)}>
					Loading…
				</p>
			</main>
		);
	}
	if (!s) {
		return (
			<main {...stylex.props(styles.page)}>
				{header}
				<p {...stylex.props(styles.note)}>Session not found</p>
			</main>
		);
	}

	const complete = s.status === 'priced' && rows.every((r) => r.parts !== null);

	return (
		<main {...stylex.props(styles.page)}>
			{header}
			<section aria-label='Session' {...stylex.props(styles.card)}>
				<h1 {...stylex.props(styles.title)}>{localDateOf(s.startUtc)}</h1>
				<StatusRow label='Energy' value={formatKwh(s.kWh)} />
				{complete ? <StatusRow label='Total incl. VAT' value={formatKr(sum(rows, 'total'))} /> : <StatusRow label='Total' value='Price pending' />}
				<StatusRow label='Peak fee share' value={`${s.peakShare.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kW`} />
			</section>
			<div {...stylex.props(styles.scroll)}>
				<table aria-label='Cost per hour (kr, VAT separate)' {...stylex.props(styles.table)}>
					<thead>
						<tr>
							{COLS.map((c) => (
								<th key={c} scope='col' {...stylex.props(styles.th)}>
									{c}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r, i) => (
							<tr key={i}>
								<td {...stylex.props(styles.td)}>{r.hour}</td>
								<td {...stylex.props(styles.td)}>{r.kWh.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
								{(['spot', 'markup', 'transfer', 'energyTax', 'vat', 'total'] as const).map((k) => (
									<td key={k} {...stylex.props(styles.td)}>
										{r.parts ? n2(r.parts[k]) : '–'}
									</td>
								))}
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td {...stylex.props(styles.td, styles.foot)}>Sum</td>
							<td {...stylex.props(styles.td, styles.foot)}>{s.kWh.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
							{(['spot', 'markup', 'transfer', 'energyTax', 'vat', 'total'] as const).map((k) => (
								<td key={k} {...stylex.props(styles.td, styles.foot)}>
									{complete ? n2(sum(rows, k)) : '–'}
								</td>
							))}
						</tr>
					</tfoot>
				</table>
			</div>
		</main>
	);
};

export default SessionDetailPage;
