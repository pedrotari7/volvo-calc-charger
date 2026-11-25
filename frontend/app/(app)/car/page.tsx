'use client';

import * as stylex from '@stylexjs/stylex';
import { formatAgo } from '@shared/format';
import type { CarState } from '@shared/types';
import type { ReactNode } from 'react';
import { CellText, Group, list } from '../../../components/List';
import { Screen } from '../../../components/Screen';
import { Note } from '../../../components/Spinner';
import { StatusRow } from '../../../components/StatusRow';
import { tileXY } from '../../../lib/osmTile';
import { useDoc } from '../../../lib/useDoc';
import { useNow } from '../../../lib/useNow';
import { colors } from '../../tokens.stylex';

const styles = stylex.create({
	tile: { width: '100%', height: 200, objectFit: 'cover', display: 'block' },
	mapLink: { color: colors.info },
	credit: { fontSize: 11, color: colors.faint },
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
	<Group header={title} aside={at ? formatAgo(at, now) : undefined}>
		{children}
	</Group>
);

const NotAvailable = () => <CellText>Not available</CellText>;

const CarPage = () => {
	const now = useNow();
	const { data: car, loading, error } = useDoc<CarState>('car/state');

	if (error) {
		return (
			<Screen title='Car'>
				<Note error>Couldn&apos;t load the car</Note>
			</Screen>
		);
	}
	if (loading) {
		return (
			<Screen title='Car'>
				<Note loading>Loading…</Note>
			</Screen>
		);
	}

	const loc = car?.location ?? null;
	const tile = loc ? tileXY(loc.value.lat, loc.value.lng, 16) : null;

	return (
		<Screen title='Car'>
			<Section title='Openings' at={car?.openings?.at} now={now}>
				{car?.openings && Object.keys(car.openings.value).length ? (
					Object.entries(car.openings.value).map(([k, v]) => (
						<StatusRow
							key={k}
							label={openingLabel(k)}
							value={v === 'open' ? 'Open' : 'Closed'}
							tone={v === 'open' ? 'bad' : undefined}
						/>
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
						car.warnings.value.map(w => <StatusRow key={w} label={sentence(w)} value='Active' tone='bad' />)
					) : (
						<CellText>No warnings</CellText>
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
						{car.service.value.days !== null ? (
							<StatusRow label='Days to service' value={num(car.service.value.days)} />
						) : null}
					</>
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Odometer' at={car?.odometerKm?.at} now={now}>
				{car?.odometerKm ? (
					<StatusRow label='Total' value={`${num(car.odometerKm.value)} km`} />
				) : (
					<NotAvailable />
				)}
			</Section>
			<Section title='Trip statistics' at={car?.trips?.at} now={now}>
				{car?.trips ? (
					Object.entries(car.trips.value).map(([k, v]) => (
						<StatusRow key={k} label={sentence(k)} value={`${num(v)}${tripUnit(k)}`} />
					))
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
							{...stylex.props(list.cell, list.pressable, styles.mapLink)}
						>
							Open in Maps
						</a>
						<a
							href='https://www.openstreetmap.org/copyright'
							target='_blank'
							rel='noopener noreferrer'
							{...stylex.props(list.cell, styles.credit)}
						>
							© OpenStreetMap contributors
						</a>
					</>
				) : (
					<NotAvailable />
				)}
			</Section>
		</Screen>
	);
};

export default CarPage;
