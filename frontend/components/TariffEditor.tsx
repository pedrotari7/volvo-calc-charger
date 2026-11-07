'use client';

import * as stylex from '@stylexjs/stylex';
import { exVat, inclVat, selectTariff } from '@shared/tariff';
import { floorHourUtc } from '@shared/time';
import type { PricedSession, Tariff } from '@shared/types';
import { doc, setDoc, where, writeBatch } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { getDb } from '../lib/firebaseClient';
import { useCollection } from '../lib/useCollection';
import { form } from './formStyles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type MoneyKey = 'energyTax' | 'markup' | 'monthlyFee' | 'fixedPerYear' | 'transferLow' | 'transferHigh' | 'peak';

const MONEY: { key: MoneyKey; label: string }[] = [
	{ key: 'energyTax', label: 'Energy tax (kr/kWh)' },
	{ key: 'markup', label: 'Fortum markup (kr/kWh)' },
	{ key: 'monthlyFee', label: 'Fortum monthly fee (kr/month)' },
	{ key: 'fixedPerYear', label: 'Nacka fixed fee (kr/year)' },
	{ key: 'transferLow', label: 'Transfer, low load (kr/kWh)' },
	{ key: 'transferHigh', label: 'Transfer, high load (kr/kWh)' },
	{ key: 'peak', label: 'Peak fee (kr/kW per month)' },
];

const readMoney = (t: Tariff): Record<MoneyKey, number> => ({
	energyTax: t.energyTaxPerKwh,
	markup: t.fortum.markupPerKwh,
	monthlyFee: t.fortum.monthlyFee,
	fixedPerYear: t.nacka.fixedPerYear,
	transferLow: t.nacka.transferLowPerKwh,
	transferHigh: t.nacka.transferHighPerKwh,
	peak: t.nacka.peakPerKwMonth,
});

const round = (n: number, digits: number) => {
	const f = 10 ** digits;

	return Math.round(n * f) / f;
};

const todayLocal = () => {
	const d = new Date();

	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Draft {
	effectiveFrom: string;
	isNew: boolean;
	// Doc id of the tariff being edited; null when adding.
	originalId: string | null;
	vatRate: number;
	money: Record<MoneyKey, string>;
	incl: Record<MoneyKey, boolean>;
	// Stored ex-VAT values and which fields were edited; untouched ones are written back as stored.
	orig: Partial<Record<MoneyKey, number>>;
	touched: Partial<Record<MoneyKey, boolean>>;
	months: number[];
	weekdaysOnly: boolean;
	fromHour: string;
	toHour: string;
}

// Money is shown incl. VAT by default (invoices show incl.) but stored ex VAT.
const toDraft = (t: Tariff, effectiveFrom: string, isNew: boolean): Draft => {
	const money = readMoney(t);
	const shown = {} as Record<MoneyKey, string>;
	const incl = {} as Record<MoneyKey, boolean>;
	for (const { key } of MONEY) {
		shown[key] = String(round(inclVat(money[key], t.vatRate), 4));
		incl[key] = true;
	}

	return {
		effectiveFrom,
		isNew,
		originalId: isNew ? null : t.id,
		vatRate: t.vatRate,
		money: shown,
		incl,
		orig: money,
		touched: {},
		months: t.nacka.highLoad.months,
		weekdaysOnly: t.nacka.highLoad.weekdaysOnly,
		fromHour: String(t.nacka.highLoad.fromHour),
		toHour: String(t.nacka.highLoad.toHour),
	};
};

// Nacka Energi's published 2026 prices for a house with a 16 A fuse, incl. VAT.
const NACKA_2026_INCL: Partial<Record<MoneyKey, string>> = {
	fixedPerYear: '3306',
	transferLow: '0.092',
	transferHigh: '0.368',
	peak: '56.52',
};

const emptyDraft = (effectiveFrom: string): Draft => {
	const money = {} as Record<MoneyKey, string>;
	const incl = {} as Record<MoneyKey, boolean>;
	const touched: Partial<Record<MoneyKey, boolean>> = {};
	for (const { key } of MONEY) {
		money[key] = NACKA_2026_INCL[key] ?? '';
		incl[key] = true;
		touched[key] = true;
	}

	return {
		effectiveFrom,
		isNew: true,
		originalId: null,
		vatRate: 0.25,
		money,
		incl,
		orig: {},
		touched,
		months: [11, 12, 1, 2, 3],
		weekdaysOnly: true,
		fromHour: '6',
		toHour: '22',
	};
};

const validDate = (s: string) => {
	if (!DATE.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number) as [number, number, number];
	const t = new Date(Date.UTC(y, m - 1, d));

	return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

const build = (d: Draft): { tariff: Omit<Tariff, 'id'> } | { errors: string[] } => {
	const errors: string[] = [];
	if (!validDate(d.effectiveFrom)) errors.push('Start date must be a real date like 2026-01-31.');
	const ex = {} as Record<MoneyKey, number>;
	for (const { key, label } of MONEY) {
		const stored = d.orig[key];
		if (!d.touched[key] && stored !== undefined) {
			ex[key] = stored;
			continue;
		}
		const n = parseNum(d.money[key]);
		if (!Number.isFinite(n) || n < 0) errors.push(`${label} must be a number, 0 or more.`);
		else ex[key] = round(d.incl[key] ? exVat(n, d.vatRate) : n, 6);
	}
	const from = parseNum(d.fromHour);
	const to = parseNum(d.toHour);
	if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 24 || from >= to) {
		errors.push('High-load hours must be whole hours, from 0 to 24, with From before To.');
	}
	if (errors.length > 0) return { errors };

	return {
		tariff: {
			effectiveFrom: d.effectiveFrom,
			vatRate: d.vatRate,
			energyTaxPerKwh: ex.energyTax,
			fortum: { markupPerKwh: ex.markup, monthlyFee: ex.monthlyFee },
			nacka: {
				fixedPerYear: ex.fixedPerYear,
				transferLowPerKwh: ex.transferLow,
				transferHighPerKwh: ex.transferHigh,
				peakPerKwMonth: ex.peak,
				highLoad: {
					months: [...d.months].sort((a, b) => a - b),
					weekdaysOnly: d.weekdaysOnly,
					fromHour: from,
					toHour: to,
				},
			},
		},
	};
};

export const TariffEditor = () => {
	const tariffs = useCollection<Tariff>('tariffs');
	const pendingConstraints = useMemo(() => [where('status', '==', 'pending')], []);
	const pending = useCollection<PricedSession>('sessions', pendingConstraints);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [errors, setErrors] = useState<string[]>([]);

	const sorted = useMemo(
		() => [...tariffs.data].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
		[tariffs.data]
	);

	const uncovered = useMemo(() => {
		if (tariffs.loading || tariffs.error) return 0;

		return pending.data.filter(
			s => selectTariff(tariffs.data, s.hours[0]?.hourStartUtc ?? floorHourUtc(s.startUtc)) === null
		).length;
	}, [pending.data, tariffs.data, tariffs.loading, tariffs.error]);

	const patch = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d));

	const toggleVat = (key: MoneyKey, incl: boolean) => {
		if (!draft) return;
		const n = parseNum(draft.money[key]);
		const shown = Number.isFinite(n)
			? String(round(incl ? inclVat(n, draft.vatRate) : exVat(n, draft.vatRate), 4))
			: draft.money[key];
		patch({ incl: { ...draft.incl, [key]: incl }, money: { ...draft.money, [key]: shown } });
	};

	const save = async () => {
		if (!draft) return;
		const built = build(draft);
		if ('errors' in built) {
			setErrors(built.errors);
			return;
		}
		const target = built.tariff.effectiveFrom;
		if (tariffs.data.some(t => t.id === target && t.id !== draft.originalId)) {
			setErrors([
				`A tariff starting ${built.tariff.effectiveFrom} already exists. Edit it or pick another date.`,
			]);
			return;
		}
		setErrors([]);
		try {
			if (draft.originalId && draft.originalId !== target) {
				// Start date changed: tariffs are keyed by start date, so move the doc atomically.
				const batch = writeBatch(getDb());
				batch.set(doc(getDb(), 'tariffs', target), built.tariff);
				batch.delete(doc(getDb(), 'tariffs', draft.originalId));
				await batch.commit();
			} else {
				await setDoc(doc(getDb(), 'tariffs', target), built.tariff);
			}
			setDraft(null);
		} catch {
			setErrors(['Could not save the tariff.']);
		}
	};

	const open = (t: Tariff | undefined, isNew: boolean) => {
		const base = t ?? sorted[0];
		setErrors([]);
		setDraft(base ? toDraft(base, isNew ? todayLocal() : base.effectiveFrom, isNew) : emptyDraft(todayLocal()));
	};

	return (
		<section aria-label='Tariffs' {...stylex.props(form.section)}>
			<h2 {...stylex.props(form.heading)}>Tariffs</h2>
			{tariffs.error ? (
				<p role='alert' {...stylex.props(form.error)}>
					Couldn&rsquo;t load tariffs
				</p>
			) : null}
			{uncovered > 0 ? (
				<p role='alert' {...stylex.props(form.warn)}>
					{uncovered} pending {uncovered === 1 ? 'session has' : 'sessions have'} no tariff covering its first
					hour. Add a tariff that starts earlier.
				</p>
			) : null}
			<ul {...stylex.props(form.list)}>
				{sorted.map(t => (
					<li key={t.id} {...stylex.props(form.item)}>
						<span>From {t.effectiveFrom}</span>
						<button
							type='button'
							aria-label={`Edit tariff from ${t.effectiveFrom}`}
							onClick={() => open(t, false)}
							{...stylex.props(form.secondary)}
						>
							Edit
						</button>
					</li>
				))}
			</ul>
			{!draft ? (
				<button type='button' onClick={() => open(undefined, true)} {...stylex.props(form.button)}>
					Add tariff
				</button>
			) : (
				<div {...stylex.props(form.section)}>
					<label {...stylex.props(form.field)}>
						Start date
						<input
							aria-label='Start date'
							value={draft.effectiveFrom}
							readOnly={!draft.isNew}
							inputMode='numeric'
							onChange={e => patch({ effectiveFrom: e.target.value })}
							{...stylex.props(form.input)}
						/>
					</label>
					{sorted.length === 0 ? (
						<p {...stylex.props(form.note)}>
							Pre-filled with Nacka Energi&rsquo;s 2026 prices (house, 16 A). Energy tax, Fortum markup
							and the monthly fee are empty: copy from your invoice.
						</p>
					) : null}
					{MONEY.map(({ key, label }) => (
						<div key={key} {...stylex.props(form.field)}>
							<label htmlFor={`tariff-${key}`}>{label}</label>
							<div {...stylex.props(form.row)}>
								<input
									id={`tariff-${key}`}
									inputMode='decimal'
									value={draft.money[key]}
									onChange={e =>
										patch({
											money: { ...draft.money, [key]: e.target.value },
											touched: { ...draft.touched, [key]: true },
										})
									}
									{...stylex.props(form.input)}
								/>
								<select
									aria-label={`${label} VAT`}
									value={draft.incl[key] ? 'incl' : 'excl'}
									onChange={e => toggleVat(key, e.target.value === 'incl')}
									{...stylex.props(form.input)}
								>
									<option value='incl'>incl. VAT</option>
									<option value='excl'>excl. VAT</option>
								</select>
							</div>
						</div>
					))}
					<fieldset {...stylex.props(form.field)}>
						<legend>High-load months</legend>
						<div {...stylex.props(form.months)}>
							{MONTHS.map((name, i) => (
								<label key={name} {...stylex.props(form.check)}>
									<input
										type='checkbox'
										checked={draft.months.includes(i + 1)}
										onChange={e =>
											patch({
												months: e.target.checked
													? [...draft.months, i + 1]
													: draft.months.filter(m => m !== i + 1),
											})
										}
									/>
									{name}
								</label>
							))}
						</div>
					</fieldset>
					<label {...stylex.props(form.check)}>
						<input
							type='checkbox'
							checked={draft.weekdaysOnly}
							onChange={e => patch({ weekdaysOnly: e.target.checked })}
						/>
						Weekdays only
					</label>
					<div {...stylex.props(form.row)}>
						<label {...stylex.props(form.field)}>
							From hour
							<input
								inputMode='numeric'
								value={draft.fromHour}
								onChange={e => patch({ fromHour: e.target.value })}
								{...stylex.props(form.input)}
							/>
						</label>
						<label {...stylex.props(form.field)}>
							To hour
							<input
								inputMode='numeric'
								value={draft.toHour}
								onChange={e => patch({ toHour: e.target.value })}
								{...stylex.props(form.input)}
							/>
						</label>
					</div>
					{errors.map(e => (
						<p key={e} role='alert' {...stylex.props(form.error)}>
							{e}
						</p>
					))}
					<div {...stylex.props(form.row)}>
						<button type='button' onClick={() => void save()} {...stylex.props(form.button)}>
							Save tariff
						</button>
						<button type='button' onClick={() => setDraft(null)} {...stylex.props(form.secondary)}>
							Cancel
						</button>
					</div>
				</div>
			)}
		</section>
	);
};
