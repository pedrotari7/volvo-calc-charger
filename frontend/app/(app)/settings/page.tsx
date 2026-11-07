'use client';

import * as stylex from '@stylexjs/stylex';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { Settings } from '@shared/types';
import { doc, setDoc } from 'firebase/firestore';
import { Suspense, useState } from 'react';
import { AllowlistEditor } from '../../../components/AllowlistEditor';
import { form } from '../../../components/formStyles';
import { PushButton } from '../../../components/PushButton';
import { TariffEditor } from '../../../components/TariffEditor';
import { VolvoConnection } from '../../../components/VolvoConnection';
import { getDb } from '../../../lib/firebaseClient';
import { useDoc } from '../../../lib/useDoc';
import { colors } from '../../tokens.stylex';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, marginInline: 'auto' },
	note: { fontSize: 13, color: colors.muted },
});

const READY_BY = /^([01]\d|2[0-3]):[0-5]\d$/;

const FIELDS = [
	{ key: 'targetPercent', label: 'Target charge (%)' },
	{ key: 'usableBatteryKwh', label: 'Usable battery (kWh)' },
	{ key: 'chargingEfficiency', label: 'Charging efficiency (0.5 to 1)' },
	{ key: 'chargerMaxKw', label: 'Charger max (kW)' },
	{ key: 'reducedKw', label: 'Reduced rate (kW)' },
	{ key: 'litres', label: 'Petrol consumption (l/100 km)' },
	{ key: 'krPerLitre', label: 'Petrol price (kr/l)' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

const NOTIFICATIONS = [
	{ key: 'plugIn', label: 'Plugged in' },
	{ key: 'sessionDone', label: 'Session done' },
	{ key: 'leftOpen', label: 'Left open' },
] as const;

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

const validate = (values: Record<FieldKey, string>, readyBy: string) => {
	const errors: string[] = [];
	const n = Object.fromEntries(FIELDS.map(({ key }) => [key, num(values[key])])) as Record<FieldKey, number>;
	if (!Number.isInteger(n.targetPercent) || n.targetPercent < 10 || n.targetPercent > 100) {
		errors.push('Target charge must be a whole number from 10 to 100.');
	}
	if (!READY_BY.test(readyBy)) errors.push('Ready by must look like 07:00.');
	if (!(n.chargingEfficiency >= 0.5 && n.chargingEfficiency <= 1))
		errors.push('Charging efficiency must be between 0.5 and 1.');
	for (const { key, label } of FIELDS) {
		if (['usableBatteryKwh', 'chargerMaxKw', 'reducedKw', 'litres', 'krPerLitre'].includes(key) && !(n[key] > 0)) {
			errors.push(`${label} must be more than 0.`);
		}
	}
	if (errors.length > 0) return { errors, data: null };

	const data: Partial<Settings> = {
		targetPercent: n.targetPercent,
		readyBy,
		usableBatteryKwh: n.usableBatteryKwh,
		chargingEfficiency: n.chargingEfficiency,
		chargerMaxKw: n.chargerMaxKw,
		reducedKw: n.reducedKw,
		petrol: { litresPer100km: n.litres, krPerLitre: n.krPerLitre },
	};

	return { errors, data };
};

const initialValues = (s: Settings): Record<FieldKey, string> => ({
	targetPercent: String(s.targetPercent),
	usableBatteryKwh: String(s.usableBatteryKwh),
	chargingEfficiency: String(s.chargingEfficiency),
	chargerMaxKw: String(s.chargerMaxKw),
	reducedKw: String(s.reducedKw),
	litres: String(s.petrol.litresPer100km),
	krPerLitre: String(s.petrol.krPerLitre),
});

const SettingsForm = ({ settings }: { settings: Settings }) => {
	const [values, setValues] = useState(() => initialValues(settings));
	const [readyBy, setReadyBy] = useState(settings.readyBy);
	const [errors, setErrors] = useState<string[]>([]);
	const [saved, setSaved] = useState(false);

	const save = async () => {
		setSaved(false);
		const result = validate(values, readyBy);
		if (!result.data) {
			setErrors(result.errors);
			return;
		}
		setErrors([]);
		try {
			await setDoc(doc(getDb(), 'config', 'settings'), result.data, { merge: true });
			setSaved(true);
		} catch {
			setErrors(['Could not save the settings.']);
		}
	};

	const toggle = async (key: (typeof NOTIFICATIONS)[number]['key'], on: boolean) => {
		try {
			await setDoc(doc(getDb(), 'config', 'settings'), { notifications: { [key]: on } }, { merge: true });
		} catch {
			setErrors(['Could not save the notification setting.']);
		}
	};

	return (
		<>
			<section aria-label='Charging settings' {...stylex.props(form.section)}>
				<h2 {...stylex.props(form.heading)}>Charging</h2>
				{FIELDS.map(({ key, label }) => (
					<label key={key} {...stylex.props(form.field)}>
						{label}
						<input
							inputMode='decimal'
							value={values[key]}
							onChange={e => {
								setSaved(false);
								setValues(v => ({ ...v, [key]: e.target.value }));
							}}
							{...stylex.props(form.input)}
						/>
					</label>
				))}
				<label {...stylex.props(form.field)}>
					Ready by
					<input
						value={readyBy}
						placeholder='07:00'
						onChange={e => {
							setSaved(false);
							setReadyBy(e.target.value);
						}}
						{...stylex.props(form.input)}
					/>
				</label>
				{errors.map(e => (
					<p key={e} role='alert' {...stylex.props(form.error)}>
						{e}
					</p>
				))}
				{saved ? (
					<p role='status' {...stylex.props(form.ok)}>
						Saved
					</p>
				) : null}
				<button type='button' onClick={() => void save()} {...stylex.props(form.button)}>
					Save settings
				</button>
			</section>
			<section aria-label='Notifications' {...stylex.props(form.section)}>
				<h2 {...stylex.props(form.heading)}>Notifications</h2>
				{NOTIFICATIONS.map(({ key, label }) => (
					<label key={key} {...stylex.props(form.check)}>
						<input
							type='checkbox'
							checked={settings.notifications[key]}
							onChange={e => void toggle(key, e.target.checked)}
						/>
						{label}
					</label>
				))}
				<PushButton />
			</section>
		</>
	);
};

const SettingsPage = () => {
	const settingsDoc = useDoc<Partial<Settings>>('config/settings');

	// Wait for the stored values so the form starts from them (not the defaults).
	const settings: Settings = {
		...DEFAULT_SETTINGS,
		...settingsDoc.data,
		petrol: { ...DEFAULT_SETTINGS.petrol, ...settingsDoc.data?.petrol },
		notifications: { ...DEFAULT_SETTINGS.notifications, ...settingsDoc.data?.notifications },
	};

	return (
		<main {...stylex.props(styles.page)}>
			{settingsDoc.error ? (
				<p role='alert' {...stylex.props(form.error)}>
					Couldn&rsquo;t load the settings
				</p>
			) : settingsDoc.loading ? (
				<p role='status' {...stylex.props(styles.note)}>
					Loading…
				</p>
			) : (
				<SettingsForm settings={settings} />
			)}
			<Suspense fallback={null}>
				<VolvoConnection />
			</Suspense>
			<TariffEditor />
			<AllowlistEditor />
		</main>
	);
};

export default SettingsPage;
