import { onSchedule } from 'firebase-functions/v2/scheduler';
import { planTonight as computePlan } from '../../shared/planner';
import { addHours, localDateOf, localParts, monthKey } from '../../shared/time';
import type { CarState, ChargerState, IsoUtc, MonthPeaks, Plan, PriceDay, Settings, Tariff } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { db } from './lib/firebase';
import { sendPush } from './lib/push';

const hhmm = (iso: string) => `${String(localParts(iso).hour).padStart(2, '0')}:00`;

function pushBody(plan: Plan, target: number): string {
	const head = `${plan.batteryPercent}% → ${target}%`;
	const r = plan.recommendation;
	if (r) return `${head}: plug in, cheapest ${hhmm(r.start)}–${hhmm(r.end)}, ≈ ${Math.round(r.cost)} kr`;
	return `${head}: plug in now, not enough time to wait for cheap hours`;
}

export async function runPlanTonight(nowUtc: IsoUtc): Promise<Plan | null> {
	const car = (await db.doc('car/state').get()).data() as CarState | undefined;
	const battery = car?.battery?.value.percent;
	if (battery === undefined || battery === null) return null;

	const stored = (await db.doc('config/settings').get()).data() as Partial<Settings> | undefined;
	const settings: Settings = {
		...DEFAULT_SETTINGS,
		...stored,
		petrol: { ...DEFAULT_SETTINGS.petrol, ...stored?.petrol },
		notifications: { ...DEFAULT_SETTINGS.notifications, ...stored?.notifications },
	};

	const days: Record<string, PriceDay> = {};
	for (const date of new Set([localDateOf(nowUtc), localDateOf(addHours(nowUtc, 24))])) {
		const d = (await db.doc(`prices/${date}`).get()).data() as PriceDay | undefined;
		if (d) days[date] = d;
	}
	const tariffs = (await db.collection('tariffs').get()).docs.map(d => ({ ...(d.data() as Tariff), id: d.id }));
	const peaksByMonth: Record<string, MonthPeaks> = {};
	for (const m of new Set([monthKey(nowUtc), monthKey(addHours(nowUtc, 14))])) {
		const p = (await db.doc(`peaks/${m}`).get()).data() as MonthPeaks | undefined;
		if (p) peaksByMonth[m] = p;
	}

	const plan = computePlan({ nowUtc, batteryPercent: battery, settings, days, tariffs, peaksByMonth });
	await db.doc(`plans/${plan.date}`).set(plan);

	if (plan.recommendation || plan.chargeNow) {
		const charger = (await db.doc('charger/state').get()).data() as ChargerState | undefined;
		if (charger?.pluggedIn !== true) {
			await sendPush({
				kind: 'plugIn',
				title: 'Charge tonight',
				body: pushBody(plan, settings.targetPercent),
				dedupeKey: `plugIn:${plan.date}`,
				url: '/',
			});
		}
	}
	return plan;
}

export const planTonight = onSchedule({ schedule: '0 18 * * *', timeZone: 'Europe/Stockholm' }, async () => {
	await runPlanTonight(new Date().toISOString());
});
