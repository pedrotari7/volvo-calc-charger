'use client';

import * as stylex from '@stylexjs/stylex';
import { formatAgo } from '@shared/format';
import type { CarState } from '@shared/types';
import type { ReactNode } from 'react';
import { StatusRow } from '../../../components/StatusRow';
import { tileXY } from '../../../lib/osmTile';
import { useDoc } from '../../../lib/useDoc';
import { useNow } from '../../../lib/useNow';
import { colors } from '../../tokens.stylex';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, marginInline: 'auto' },
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
	head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
	title: { fontSize: 16, fontWeight: 600, color: colors.ink },
	muted: { fontSize: 13, color: colors.muted },
	error: { fontSize: 13, color: colors.bad },
	link: { fontSize: 14, color: colors.info },
	tile: { width: 256, height: 256, maxWidth: '100%', borderRadius: 12, alignSelf: 'center' },
});

const sentence = (key: string) => {
	const s = key.replace(/([A-Z])/g, ' $1').toLowerCase();
	return s.charAt(0).toUpperCase() + s.slice(1);
};

const OPENING_SUFFIX: Record<string, string> = { door: 'door', window: 'window' };
const openingLabel = (key: string) => {
	const [kind, pos] = key.split(':');
	if (pos === undefined) return sentence(key);
	return `${sentence(pos)} ${OPENING_SUFFIX[kind] ?? kind}`;
};

const tripUnit = (key: string): string => {
	if (/speed/i.test(key)) return ' km/h';
	if (/energyconsumption/i.test(key)) return ' kWh/100 km';
	if (/^(tripmeter|distance)/i.test(key)) return ' km';
	return '';
};

// Up to 5 decimals, trailing zeros dropped (59.31 stays 59.31).
const coord = (n: number) => String(Number(n.toFixed(5)));

const num = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

const Section = ({ title, at, now, children }: { title: string; at?: string; now: string; children: ReactNode }) => (
	<section aria-label={title} {...stylex.props(styles.card)}>
		<div {...stylex.props(styles.head)}>
			<h2 {...stylex.props(styles.title)}>{title}</h2>
			{at ? <span {...stylex.props(styles.muted)}>{formatAgo(at, now)}</span> : null}
		</div>
		{children}
	</section>
);

const NotAvailable = () => <p {...stylex.props(styles.muted)}>Not available</p>;

const CarPage = () => {
	const now = useNow();
	const { data: car, loading, error } = useDoc<CarState>('car/state');

	if (error) {
		return (
			<main {...stylex.props(styles.page)}>
				<p role='alert' {...stylex.props(styles.error)}>
					Couldn&apos;t load the car
				</p>
			</main>
		);
	}
	if (loading) {
		return (
			<main {...stylex.props(styles.page)}>
				<p role='status' {...stylex.props(styles.muted)}>
					Loading…
				</p>
			</main>
		);
	}

	const loc = car?.location ?? null;
	const tile = loc ? tileXY(loc.value.lat, loc.value.lng, 16) : null;

	return (
		<main {...stylex.props(styles.page)}>
			<Section title='Openings' at={car?.openings?.at} now={now}>
				{car?.openings && Object.keys(car.openings.value).length ? (
					Object.entries(car.openings.value).map(([k, v]) => (
						<StatusRow key={k} label={openingLabel(k)} value={v === 'open' ? 'Open' : 'Closed'} tone={v === 'open' ? 'bad' : undefined} />
					))
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Tyres' at={car?.tyres?.at} now={now}>
				{car?.tyres && Object.keys(car.tyres.value).length ? (
					Object.entries(car.tyres.value).map(([k, v]) => <StatusRow key={k} label={sentence(k)} value={v} />)
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Warnings' at={car?.warnings?.at} now={now}>
				{car?.warnings ? (
					car.warnings.value.length ? (
						car.warnings.value.map((w) => <StatusRow key={w} label={sentence(w)} value='Active' tone='bad' />)
					) : (
						<p {...stylex.props(styles.muted)}>No warnings</p>
					)
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Service' at={car?.service?.at} now={now}>
				{car?.service ? (
					<>
						<StatusRow label='Status' value={sentence(car.service.value.status)} />
						{car.service.value.distanceKm !== null ? (
							<StatusRow label='Distance to service' value={`${num(car.service.value.distanceKm)} km`} />
						) : null}
						{car.service.value.days !== null ? <StatusRow label='Days to service' value={num(car.service.value.days)} /> : null}
					</>
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Odometer' at={car?.odometerKm?.at} now={now}>
				{car?.odometerKm ? <StatusRow label='Total' value={`${num(car.odometerKm.value)} km`} /> : <NotAvailable />}
			</Section>
			<Section title='Trip statistics' at={car?.trips?.at} now={now}>
				{car?.trips ? (
					Object.entries(car.trips.value).map(([k, v]) => <StatusRow key={k} label={sentence(k)} value={`${num(v)}${tripUnit(k)}`} />)
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Location' at={loc?.at} now={now}>
				{loc && tile ? (
					<>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`https://tile.openstreetmap.org/16/${tile.x}/${tile.y}.png`}
							alt='Map of the car’s last known position'
							width={256}
							height={256}
							{...stylex.props(styles.tile)}
						/>
						<a
							href={`https://maps.apple.com/?ll=${coord(loc.value.lat)},${coord(loc.value.lng)}`}
							{...stylex.props(styles.link)}
						>
							Open in Maps
						</a>
						<a
							href='https://www.openstreetmap.org/copyright'
							target='_blank'
							rel='noopener noreferrer'
							{...stylex.props(styles.muted)}
						>
							© OpenStreetMap contributors
						</a>
					</>
				) : (
					<NotAvailable />
				)}
			</Section>
		</main>
	);
};

export default CarPage;
