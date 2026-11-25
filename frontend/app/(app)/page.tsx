'use client';

import * as stylex from '@stylexjs/stylex';
import { allInRateInclVat } from '@shared/pricing';
import { addHours, eveningDateOf, floorHourUtc, localParts, monthKey } from '@shared/time';
import type { CarState, ChargerState, MonthPeaks, PriceDay, Plan, Settings, Tariff } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { documentId, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Banner } from '../../components/Banner';
import { CarSummary } from '../../components/CarSummary';
import type { ChargeWindow } from '../../components/ChargeEstimator';
import { ChargeEstimator } from '../../components/ChargeEstimator';
import { CommandButtons } from '../../components/CommandButtons';
import { PriceChart } from '../../components/PriceChart';
import { Screen } from '../../components/Screen';
import { Note } from '../../components/Spinner';
import { TonightCard } from '../../components/TonightCard';
import { useCollection } from '../../lib/useCollection';
import { useDoc } from '../../lib/useDoc';
import { useNow } from '../../lib/useNow';

const styles = stylex.create({
	stack: { display: 'flex', flexDirection: 'column', gap: 12 },
});

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
	const months = [...new Set([monthKey(now), monthKey(addHours(now, 48))])];
	const monthsKey = months.join(',');
	const peakConstraints = useMemo(() => [where(documentId(), 'in', monthsKey.split(','))], [monthsKey]);
	const peaks = useCollection<MonthPeaks>('peaks', peakConstraints);
	const stored = useDoc<Partial<Settings>>('config/settings');
	const [estimateWindow, setEstimateWindow] = useState<ChargeWindow | null>(null);

	const days = useMemo(() => Object.fromEntries(prices.data.map(d => [d.id, d])), [prices.data]);
	const rateNow = allInRateInclVat(floorHourUtc(now), days, tariffs.data);
	const rec = plan.data?.recommendation ?? null;
	const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...stored.data }), [stored.data]);
	const peaksByMonth = useMemo(() => Object.fromEntries(peaks.data.map(p => [p.id, p])), [peaks.data]);
	const chartWindow = estimateWindow ?? (rec ? { start: rec.start, end: rec.end } : null);

	return (
		<Screen title='Home'>
			<Banner
				zaptecLastOkAt={zaptec.data?.lastOkAt ?? null}
				volvoConnected={volvo.loading || volvo.data?.connected === true}
				now={now}
			/>
			{car.error ? <Note error>Couldn&apos;t load the car</Note> : null}
			{charger.error ? <Note error>Couldn&apos;t load the charger</Note> : null}
			<div {...stylex.props(styles.stack)}>
				{car.loading ? (
					<Note loading>Loading…</Note>
				) : (
					<CarSummary car={car.data} charger={charger.data} now={now} rateNow={rateNow} />
				)}
				{plan.error ? (
					<Note error>Couldn&apos;t load the plan</Note>
				) : plan.loading ? null : (
					<TonightCard plan={plan.data} />
				)}
			</div>
			{prices.error || tariffs.error ? (
				<Note error>Couldn&apos;t load prices</Note>
			) : prices.loading || tariffs.loading ? (
				<Note loading>Loading prices…</Note>
			) : (
				<>
					<PriceChart days={days} tariffs={tariffs.data} now={now} window={chartWindow} />
					<ChargeEstimator
						now={now}
						batteryPercent={car.data?.battery?.value.percent ?? null}
						settings={settings}
						days={days}
						tariffs={tariffs.data}
						peaksByMonth={peaksByMonth}
						onWindow={setEstimateWindow}
					/>
				</>
			)}
			<CommandButtons locked={car.data?.locked?.value ?? null} />
		</Screen>
	);
};

export default HomePage;
