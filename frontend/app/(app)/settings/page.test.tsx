import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
	doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
	setDoc: (...args: unknown[]) => setDoc(...args),
}));
vi.mock('../../../lib/firebaseClient', () => ({ getDb: () => ({}) }));
vi.mock('../../../components/TariffEditor', () => ({ TariffEditor: () => <div>tariff-editor</div> }));
vi.mock('../../../components/AllowlistEditor', () => ({ AllowlistEditor: () => <div>allowlist-editor</div> }));
vi.mock('../../../components/VolvoConnection', () => ({ VolvoConnection: () => <div>volvo-connection</div> }));

const useDoc = vi.fn((_p: string): unknown => ({ data: null, loading: false, error: null }));
vi.mock('../../../lib/useDoc', () => ({ useDoc: (p: string) => useDoc(p) }));

import SettingsPage from './page';

beforeEach(() => {
	setDoc.mockReset().mockResolvedValue(undefined);
	useDoc.mockReset().mockReturnValue({ data: null, loading: false, error: null });
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SettingsPage', () => {
	it('shows defaults and saves valid values with merge', async () => {
		render(<SettingsPage />);
		expect(screen.getByLabelText('Ready by')).toHaveValue('07:00');
		type('Target charge (%)', '90');
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
		const [ref, data, opts] = setDoc.mock.calls[0]!;
		expect(ref).toEqual({ path: 'config/settings' });
		expect(data).toMatchObject({
			targetPercent: 90,
			readyBy: '07:00',
			petrol: { litresPer100km: 7.5, krPerLitre: 18 },
		});
		expect(opts).toEqual({ merge: true });
	});

	it('rejects readyBy "7am" with an inline error and does not write', () => {
		render(<SettingsPage />);
		type('Ready by', '7am');
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		expect(screen.getByText('Ready by must look like 07:00.')).toBeInTheDocument();
		expect(setDoc).not.toHaveBeenCalled();
	});

	it.each([
		['Target charge (%)', '9'],
		['Target charge (%)', '101'],
		['Target charge (%)', '80.5'],
		['Charging efficiency (0.5 to 1)', '0.4'],
		['Charging efficiency (0.5 to 1)', '1.1'],
		['Usable battery (kWh)', '0'],
		['Charger max (kW)', '-1'],
		['Reduced rate (kW)', 'abc'],
		['Petrol consumption (l/100 km)', '0'],
		['Petrol price (kr/l)', ''],
	])('rejects %s = "%s"', (label, value) => {
		render(<SettingsPage />);
		type(label, value);
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
		expect(setDoc).not.toHaveBeenCalled();
	});

	it('writes a notification toggle', async () => {
		render(<SettingsPage />);
		fireEvent.click(screen.getByLabelText('Session done'));
		await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
		expect(setDoc).toHaveBeenCalledWith(
			{ path: 'config/settings' },
			{ notifications: { sessionDone: false } },
			{ merge: true }
		);
	});

	it('renders the other sections', () => {
		render(<SettingsPage />);
		expect(screen.getByText('tariff-editor')).toBeInTheDocument();
		expect(screen.getByText('allowlist-editor')).toBeInTheDocument();
		expect(screen.getByText('volvo-connection')).toBeInTheDocument();
	});
});
