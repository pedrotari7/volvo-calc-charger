import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAuth } from 'firebase-admin/auth';
import { DEV_USER } from '../../shared/devUser';
import { computeMonthPeaks, sumPeakShares } from '../../shared/peaks';
import { planTonight } from '../../shared/planner';
import { parseElpriset } from '../../shared/prices';
import { priceSession } from '../../shared/pricing';
import { TEST_TARIFF } from '../../shared/testdata';
import { eveningDateOf, localDateOf, monthKey } from '../../shared/time';
import type { MonthPeaks, PriceDay, Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { parseCarState } from '../../shared/volvo';
import { parseZaptecSessions } from '../../shared/zaptec';
import { db } from '../src/lib/firebase';

// Usage: pnpm seed (inside the emulators, see `pnpm dev:seeded` and `pnpm test:e2e`).
// Everything is derived from the same fixtures and shared functions the backend uses,
// so a seeded database is one the functions could have produced.
const FIXTURES = path.resolve(__dirname, '../test/fixtures');
const readJson = (...parts: string[]): unknown => JSON.parse(readFileSync(path.join(FIXTURES, ...parts), 'utf8'));

// The fixture sessions end on 2026-11-03 and the price fixture covers that day; the
// plan is computed in the afternoon of that day, when the evening window is fully priced.
const PRICE_DATES = ['2026-11-03'];
const PLAN_NOW = '2026-11-03T12:00:00.000Z';

async function seedDevUser(): Promise<void> {
	const auth = getAuth();
	const profile = {
		email: DEV_USER.email,
		password: DEV_USER.password,
		displayName: DEV_USER.displayName,
		emailVerified: true,
	};
	try {
		const existing = await auth.getUserByEmail(DEV_USER.email);
		await auth.updateUser(existing.uid, profile);
	} catch (e) {
		if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
		await auth.createUser(profile);
	}
	await db.doc('config/allowlist').set({ emails: [DEV_USER.email] });
}

async function main(): Promise<void> {
	// Never seed a real project by accident: a demo project and both emulators, or nothing.
	const projectId = process.env.GCLOUD_PROJECT ?? '';
	if (
		!projectId.startsWith('demo-') ||
		!process.env.FIRESTORE_EMULATOR_HOST ||
		!process.env.FIREBASE_AUTH_EMULATOR_HOST
	) {
		throw new Error(
			'Refusing to seed: needs a demo-* project and the Auth and Firestore emulators (pnpm dev:seeded / pnpm test:e2e).'
		);
	}
	const now = new Date().toISOString();

	await seedDevUser();

	const settings: Settings = DEFAULT_SETTINGS;
	await db.doc('config/settings').set(settings);

	// Tariff docs are keyed by their start date and carry no id field.
	const { id: _id, ...tariff } = TEST_TARIFF;
	await db.doc(`tariffs/${tariff.effectiveFrom}`).set(tariff);
	const tariffs = [TEST_TARIFF];

	const days: Record<string, PriceDay> = {};
	for (const date of PRICE_DATES) {
		days[date] = parseElpriset(date, readJson('elpriset', `${date}_SE3.json`));
		await db.doc(`prices/${date}`).set(days[date]!);
	}

	// Sessions, priced and peak-shared exactly as `repriceAndUpdatePeaks` does.
	const sessions = parseZaptecSessions(readJson('zaptec', 'chargehistory.json'));
	const months = [...new Set(sessions.flatMap(s => s.hours.map(h => monthKey(h.hourStartUtc))))];
	const peaksByMonth: Record<string, MonthPeaks> = {};
	for (const month of months) {
		peaksByMonth[month] = computeMonthPeaks(month, sessions, TEST_TARIFF);
		await db.doc(`peaks/${month}`).set(peaksByMonth[month]!);
	}
	const shares = sumPeakShares(Object.values(peaksByMonth));
	for (const s of sessions) {
		const { status, cost } = priceSession(s, days, tariffs);
		await db.doc(`sessions/${s.id}`).set({
			startUtc: s.startUtc,
			endUtc: s.endUtc,
			kWh: s.kWh,
			hours: s.hours,
			status,
			cost,
			peakShare: shares[s.id] ?? 0,
			planned: null,
			notified: true,
		});
	}

	// Car state from the Volvo fixtures.
	const raw = {
		vehicles: readJson('volvo', 'vehicles.json'),
		doors: readJson('volvo', 'doors.json'),
		windows: readJson('volvo', 'windows.json'),
		odometer: readJson('volvo', 'odometer.json'),
		tyres: readJson('volvo', 'tyres.json'),
		warnings: readJson('volvo', 'warnings.json'),
		energy: readJson('volvo', 'energy-state.json'),
		location: readJson('volvo', 'location.json'),
		diagnostics: readJson('volvo', 'diagnostics.json'),
		statistics: readJson('volvo', 'statistics.json'),
	};
	const car = parseCarState(raw, now);
	await db.doc('car/state').set(car);
	if (car.odometerKm) {
		await db
			.doc(`odometer/${localDateOf(car.odometerKm.at)}`)
			.set({ km: car.odometerKm.value, at: car.odometerKm.at });
	}
	await db.doc('charger/state').set({ pluggedIn: false, charging: false, liveKw: 0, sessionKwh: 0, updatedAt: now });

	// Tonight's plan. The prices only exist for the fixture day, so the plan is computed
	// then and filed under the evening Home asks for today (`eveningDateOf`, as page.tsx),
	// which is what lets the app render a plan whatever day the seed runs.
	const battery = car.battery?.value.percent ?? 0;
	const plan = planTonight({ nowUtc: PLAN_NOW, batteryPercent: battery, settings, days, tariffs, peaksByMonth });
	const eveningDate = eveningDateOf(now);
	await db.doc(`plans/${plan.date}`).set(plan);
	if (eveningDate !== plan.date) await db.doc(`plans/${eveningDate}`).set({ ...plan, date: eveningDate });

	await db.doc('status/zaptec').set({ lastOkAt: now });
	await db.doc('status/volvo').set({ connected: true, grantStartedAt: now, lastRefreshError: null });

	console.log(
		`Seeded ${sessions.length} sessions, ${Object.keys(days).length} price day(s), plan for ${eveningDate}, dev user ${DEV_USER.email}`
	);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
