import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tariff } from '@shared/types';

const setDoc = vi.fn();
const batchOps: [string, unknown, unknown?][] = [];
const commit = vi.fn();
vi.mock('firebase/firestore', () => ({
	doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
	setDoc: (...a: unknown[]) => setDoc(...a),
	writeBatch: () => ({
		set: (ref: unknown, data: unknown) => batchOps.push(['set', ref, data]),
		delete: (ref: unknown) => batchOps.push(['delete', ref]),
		commit: () => commit(),
	}),
	where: (...a: unknown[]) => ({ where: a }),
}));
vi.mock('../lib/firebaseClient', () => ({ getDb: () => ({}) }));

const mk = (id: string, effectiveFrom: string): Tariff => ({
	id,
	effectiveFrom,
	vatRate: 0.25,
	energyTaxPerKwh: 0.36,
	fortum: { markupPerKwh: 0.05, monthlyFee: 39.2 },
	nacka: {
		fixedPerYear: 2000,
		transferLowPerKwh: 0.2,
		transferHighPerKwh: 0.4,
		peakPerKwMonth: 45,
		highLoad: { months: [11, 12, 1, 2, 3], weekdaysOnly: true, fromHour: 6, toHour: 22 },
	},
});
let tariffs: Tariff[] = [];
let pending: unknown[] = [];
const useCollection = vi.fn((path: string, _c?: unknown): unknown => ({
	data: path === 'tariffs' ? tariffs : pending,
	loading: false,
	error: null,
}));
vi.mock('../lib/useCollection', () => ({ useCollection: (p: string, c?: unknown) => useCollection(p, c) }));

import { TariffEditor } from './TariffEditor';

beforeEach(() => {
	setDoc.mockReset().mockResolvedValue(undefined);
	commit.mockReset().mockResolvedValue(undefined);
	batchOps.length = 0;
	tariffs = [mk('2025-01-01', '2025-01-01'), mk('2026-01-01', '2026-01-01')];
	pending = [];
});

describe('TariffEditor', () => {
	it('lists tariffs newest first', () => {
		render(<TariffEditor />);
		const labels = screen.getAllByText(/^From \d/).map(e => e.textContent);
		expect(labels).toEqual(['From 2026-01-01', 'From 2025-01-01']);
	});

	it('stores 0.368 incl. VAT as 0.2944 ex VAT, keyed by start date, with copied structure', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-07T12:00:00'));
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		expect(screen.getByLabelText('Start date')).toHaveValue('2026-11-07');
		expect(screen.getByLabelText('Energy tax (kr/kWh) VAT')).toHaveValue('incl');
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh)'), { target: { value: '0.368' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
		const [ref, data] = setDoc.mock.calls[0]!;
		expect(ref).toEqual({ path: 'tariffs/2026-11-07' });
		expect(data.energyTaxPerKwh).toBe(0.2944);
		expect(data.effectiveFrom).toBe('2026-11-07');
		expect(data.nacka.highLoad).toEqual({ months: [1, 2, 3, 11, 12], weekdaysOnly: true, fromHour: 6, toHour: 22 });
		expect(data.fortum.markupPerKwh).toBe(0.05);
		expect(data).not.toHaveProperty('id');
		vi.useRealTimers();
	});

	it('stores excl. VAT values as typed', async () => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh) VAT'), { target: { value: 'excl' } });
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh)'), { target: { value: '0.3' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalled());
		expect(setDoc.mock.calls[0]![1].energyTaxPerKwh).toBe(0.3);
	});

	it('toggles high-load months and does not write invalid input', async () => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		fireEvent.click(screen.getByLabelText('Apr'));
		fireEvent.click(screen.getByLabelText('Jan'));
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh)'), { target: { value: 'x' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Energy tax');
		expect(setDoc).not.toHaveBeenCalled();
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh)'), { target: { value: '0.4' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalled());
		expect(setDoc.mock.calls[0]![1].nacka.highLoad.months).toEqual([2, 3, 4, 11, 12]);
	});

	it('warns when a pending session starts before every tariff', () => {
		pending = [
			{
				id: 's1',
				status: 'pending',
				startUtc: '2024-06-01T10:00:00.000Z',
				hours: [{ hourStartUtc: '2024-06-01T10:00:00.000Z', kWh: 1 }],
			},
		];
		render(<TariffEditor />);
		expect(screen.getByRole('alert')).toHaveTextContent('1 pending session has no tariff');
	});

	it('does not warn when pending sessions are covered', () => {
		pending = [
			{
				id: 's1',
				status: 'pending',
				startUtc: '2026-06-01T10:00:00.000Z',
				hours: [{ hourStartUtc: '2026-06-01T10:00:00.000Z', kWh: 1 }],
			},
		];
		render(<TariffEditor />);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('passes a stable constraints array to the sessions query', () => {
		const { rerender } = render(<TariffEditor />);
		rerender(<TariffEditor />);
		const calls = useCollection.mock.calls.filter(([p]) => p === 'sessions');
		expect(calls.at(-1)![1]).toBe(calls[0]![1]);
	});

	it('rejects an add whose start date already has a tariff', () => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		expect(screen.getByRole('alert')).toHaveTextContent('already exists');
		expect(setDoc).not.toHaveBeenCalled();
	});

	it('moves a tariff whose start date is edited instead of copying it', async () => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Edit tariff from 2026-01-01' }));
		fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-07-01' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
		expect(setDoc).not.toHaveBeenCalled();
		expect(batchOps.map(([op, ref]) => [op, ref])).toEqual([
			['set', { path: 'tariffs/2025-07-01' }],
			['delete', { path: 'tariffs/2026-01-01' }],
		]);
		expect((batchOps[0]![2] as Tariff).effectiveFrom).toBe('2025-07-01');
	});

	it('rejects moving a tariff onto a start date that already has one', () => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Edit tariff from 2026-01-01' }));
		fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-01-01' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		expect(screen.getByRole('alert')).toHaveTextContent('already exists');
		expect(setDoc).not.toHaveBeenCalled();
		expect(commit).not.toHaveBeenCalled();
	});

	it('writes untouched money fields exactly as stored, also after toggling VAT mode twice', async () => {
		tariffs = [{ ...mk('2026-01-01', '2026-01-01'), energyTaxPerKwh: 0.1234 }];
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Edit tariff from 2026-01-01' }));
		fireEvent.change(screen.getByLabelText('Fortum markup (kr/kWh)'), { target: { value: '0.0625' } });
		const vat = screen.getByLabelText('Energy tax (kr/kWh) VAT');
		fireEvent.change(vat, { target: { value: 'excl' } });
		fireEvent.change(vat, { target: { value: 'incl' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalled());
		const [ref, data] = setDoc.mock.calls[0]!;
		expect(ref).toEqual({ path: 'tariffs/2026-01-01' });
		expect(data.energyTaxPerKwh).toBe(0.1234);
		expect(data.fortum.markupPerKwh).toBe(0.05);
		expect(data.nacka.peakPerKwMonth).toBe(45);
	});

	it.each(['2026-13-45', '2026-02-30', '2026-1-1'])('rejects the impossible start date %s', date => {
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		fireEvent.change(screen.getByLabelText('Start date'), { target: { value: date } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Start date');
		expect(setDoc).not.toHaveBeenCalled();
	});

	it('creates the first tariff from Nacka 2026 defaults, requiring the invoice fields', async () => {
		tariffs = [];
		render(<TariffEditor />);
		fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }));
		expect(screen.getByText(/copy from your invoice/)).toBeInTheDocument();
		expect(screen.getByLabelText('Nacka fixed fee (kr/year)')).toHaveValue('3306');
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		expect(screen.getAllByRole('alert').length).toBe(3);
		expect(setDoc).not.toHaveBeenCalled();
		fireEvent.change(screen.getByLabelText('Energy tax (kr/kWh)'), { target: { value: '0.5' } });
		fireEvent.change(screen.getByLabelText('Fortum markup (kr/kWh)'), { target: { value: '0.0625' } });
		fireEvent.change(screen.getByLabelText('Fortum monthly fee (kr/month)'), { target: { value: '49' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save tariff' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
		const data = setDoc.mock.calls[0]![1];
		expect(data.vatRate).toBe(0.25);
		expect(data.nacka.fixedPerYear).toBe(2644.8);
		expect(data.nacka.transferLowPerKwh).toBe(0.0736);
		expect(data.nacka.transferHighPerKwh).toBe(0.2944);
		expect(data.nacka.peakPerKwMonth).toBe(45.216);
		expect(data.energyTaxPerKwh).toBe(0.4);
		expect(data.nacka.highLoad).toEqual({ months: [1, 2, 3, 11, 12], weekdaysOnly: true, fromHour: 6, toHour: 22 });
	});
});
