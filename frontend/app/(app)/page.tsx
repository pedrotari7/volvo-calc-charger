'use client';

import * as stylex from '@stylexjs/stylex';
import { allInRateInclVat } from '@shared/pricing';
import { addHours, eveningDateOf, floorHourUtc, localParts } from '@shared/time';
import type { CarState, ChargerState, PriceDay, Plan, Tariff } from '@shared/types';
import { documentId, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Banner } from '../../components/Banner';
import { CarSummary } from '../../components/CarSummary';
import { CommandButtons } from '../../components/CommandButtons';
import { PriceChart } from '../../components/PriceChart';
import { TonightCard } from '../../components/TonightCard';
import { useCollection } from '../../lib/useCollection';
import { colors } from '../tokens.stylex';
import { useDoc } from '../../lib/useDoc';
import { useNow } from '../../lib/useNow';

const styles = stylex.create({
	note: { fontSize: 13, color: colors.muted },
	error: { fontSize: 13, color: colors.bad },
	page: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, marginInline: 'auto' },
});

const Note = ({ error, children }: { error?: boolean; children: string }) => (
	<p role={error ? 'alert' : 'status'} {...stylex.props(error ? styles.error : styles.note)}>
		{children}
	</p>
);

const HomePage = () => {
	const now = useNow();
	const today = localParts(now).date;
	const tomorrow = localParts(addHours(now, 24)).date;
	const eveningDate = eveningDateOf(now);

	const car = useDoc<CarState>('car/state');
	const charger = useDoc<ChargerState>('charger/state');
	const plan = useDoc<Plan>(`plans/${eveningDate}`);
	const zaptec = useDoc<{ lastOkAt?: string }>('status/zaptec');
	const volvo = useDoc<{ connected?: boolean }>('status/volvo');
	const priceConstraints = useMemo(() => [where(documentId(), 'in', [today, tomorrow])], [today, tomorrow]);
	const prices = useCollection<PriceDay>('prices', priceConstraints);
	const tariffs = useCollection<Tariff>('tariffs');

	const days = useMemo(() => Object.fromEntries(prices.data.map((d) => [d.id, d])), [prices.data]);
	const rateNow = allInRateInclVat(floorHourUtc(now), days, tariffs.data);
	const rec = plan.data?.recommendation ?? null;

	return (
		<main {...stylex.props(styles.page)}>
			<Banner
				zaptecLastOkAt={zaptec.data?.lastOkAt ?? null}
				volvoConnected={volvo.loading || volvo.data?.connected === true}
				now={now}
			/>
			{car.error ? <Note error>Couldn&apos;t load the car</Note> : null}
			{charger.error ? <Note error>Couldn&apos;t load the charger</Note> : null}
			{car.loading ? (
				<Note>Loading…</Note>
			) : (
				<CarSummary car={car.data} charger={charger.data} now={now} rateNow={rateNow} />
			)}
			{plan.error ? <Note error>Couldn&apos;t load the plan</Note> : plan.loading ? null : <TonightCard plan={plan.data} />}
			{prices.error || tariffs.error ? (
				<Note error>Couldn&apos;t load prices</Note>
			) : prices.loading || tariffs.loading ? (
				<Note>Loading prices…</Note>
			) : (
				<PriceChart
					days={days}
					tariffs={tariffs.data}
					now={now}
					window={rec ? { start: rec.start, end: rec.end } : null}
				/>
			)}
			<CommandButtons locked={car.data?.locked?.value ?? null} />
		</main>
	);
};

export default HomePage;
