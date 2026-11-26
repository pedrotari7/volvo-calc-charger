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
import { Icon } from '../../../components/Icon';
import type { IconName } from '../../../components/Icon';
import { colors, fonts, tint } from '../../tokens.stylex';

const styles = stylex.create({
	tile: { width: '100%', height: 200, objectFit: 'cover', display: 'block' },
	mapLink: { color: colors.info },
	credit: { fontSize: 11, color: colors.faint },
	glance: {
		display: 'grid',
		gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		gap: 10,
		marginBottom: 8,
	},
	glanceTile: {
		display: 'flex',
		flexDirection: 'column',
		gap: 10,
		padding: 14,
		borderRadius: 16,
		backgroundColor: colors.surface,
		color: colors.ink,
		textDecoration: 'none',
		transitionProperty: 'transform',
		transitionDuration: '0.15s',
		':active': { transform: 'scale(0.97)' },
	},
	badge: {
		width: 32,
		height: 32,
		borderRadius: 10,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	ok: { backgroundColor: tint.brand15, color: colors.good },
	bad: { backgroundColor: tint.bad15, color: colors.bad },
	unknown: { backgroundColor: tint.fill, color: colors.muted },
	tileValue: { fontFamily: fonts.rounded, fontSize: 17, fontWeight: 700, lineHeight: 1.2 },
	tileLabel: { fontSize: 13, color: colors.muted },
});

type Tone = 'ok' | 'bad' | 'unknown';

const GlanceTile = ({
	href,
	icon,
	label,
	value,
	tone,
}: {
	href: string;
	icon: IconName;
	label: string;
	value: string;
	tone: Tone;
}) => (
	<a href={href} {...stylex.props(styles.glanceTile)}>
		<span {...stylex.props(styles.badge, styles[tone])}>
			<Icon name={tone === 'bad' ? 'warning' : icon} size={18} strokeWidth={2} />
		</span>
		<span {...stylex.props(styles.tileValue)}>{value}</span>
		<span {...stylex.props(styles.tileLabel)}>{label}</span>
	</a>
);

/** The car's state in four tiles, each jumping to its section. */
const Glance = ({ car }: { car: CarState | null }) => {
	const open = car?.openings ? Object.entries(car.openings.value).filter(([, v]) => v === 'open') : null;
	const unlocked = car?.locked?.value === false;
	const tyresBad = car?.tyres ? Object.values(car.tyres.value).filter(v => !isOk(v)).length : null;
	const warnings = car?.warnings?.value.length ?? null;
	const service = car?.service?.value ?? null;
	const serviceDue = service !== null && !isOk(service.status);

	return (
		<div aria-label='At a glance' role='group' {...stylex.props(styles.glance)}>
			<GlanceTile
				href='#openings'
				icon='lock'
				label='Doors, windows & lock'
				value={
					open === null && car?.locked == null
						? 'Unknown'
						: open && open.length
							? `${open.length} open`
							: unlocked
								? 'Unlocked'
								: 'All shut'
				}
				tone={
					open === null && car?.locked == null
						? 'unknown'
						: (open?.length ?? 0) > 0 || unlocked
							? 'bad'
							: 'ok'
				}
			/>
			<GlanceTile
				href='#warnings'
				icon='check'
				label='Warnings'
				value={warnings === null ? 'Unknown' : warnings === 0 ? 'None' : `${warnings} active`}
				tone={warnings === null ? 'unknown' : warnings > 0 ? 'bad' : 'ok'}
			/>
			<GlanceTile
				href='#tyres'
				icon='car'
				label='Tyres'
				value={tyresBad === null ? 'Unknown' : tyresBad === 0 ? 'OK' : `${tyresBad} to check`}
				tone={tyresBad === null ? 'unknown' : tyresBad > 0 ? 'bad' : 'ok'}
			/>
			<GlanceTile
				href='#service'
				icon='gear'
				label='Service'
				value={
					service === null
						? 'Unknown'
						: service.distanceKm !== null
							? `in ${num(service.distanceKm)} km`
							: service.days !== null
								? `in ${num(service.days)} days`
								: status(service.status)
				}
				tone={service === null ? 'unknown' : serviceDue ? 'bad' : 'ok'}
			/>
		</div>
	);
};

const sentence = (key: string) => {
	const s = key.replace(/([A-Z])/g, ' $1').toLowerCase();
	return s.charAt(0).toUpperCase() + s.slice(1);
};

// Volvo's "nothing wrong" values.
const isOk = (v: string) => /^(no_?warning|ok|unspecified)$/i.test(v);

// Volvo status codes (NO_WARNING, VERY_LOW_PRESSURE…) as words; "nothing wrong" codes read OK.
const status = (code: string) => (isOk(code) ? 'OK' : sentence(code.toLowerCase().replace(/_/g, ' ')));

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
	<div id={title.toLowerCase().split(' ')[0]}>
		<Group header={title} aside={at ? formatAgo(at, now) : undefined}>
			{children}
		</Group>
	</div>
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
			<Glance car={car} />
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
					Object.entries(car.tyres.value).map(([k, v]) => (
						<StatusRow key={k} label={sentence(k)} value={status(v)} tone={isOk(v) ? undefined : 'bad'} />
					))
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
						<StatusRow label='Status' value={status(car.service.value.status)} />
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
