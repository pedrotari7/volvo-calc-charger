import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PriceDay, Tariff } from '@shared/types';
import { PriceChart } from './PriceChart';

const tariff: Tariff = {
	id: 't',
	effectiveFrom: '2026-01-01',
	vatRate: 0.25,
	energyTaxPerKwh: 0.4,
	fortum: { markupPerKwh: 0.1, monthlyFee: 0 },
	nacka: {
		fixedPerYear: 0,
		transferLowPerKwh: 0.2,
		transferHighPerKwh: 0.4,
		peakPerKwMonth: 0,
		highLoad: { months: [], weekdaysOnly: true, fromHour: 6, toHour: 22 },
	},
};
const day = (date: string, base: number): PriceDay => ({
	date,
	quarters: Array.from({ length: 96 }, (_, i) => ({
		start: `${date}T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00+01:00`,
		sekPerKwhExVat: base + Math.floor(i / 4) / 100,
	})),
});
const days = { '2026-11-07': day('2026-11-07', 0.5), '2026-11-08': day('2026-11-08', 1) };
const NOW = '2026-11-07T10:30:00.000Z';

describe('PriceChart', () => {
	it('is an accessible image summarising min and max, with plan and current hour marked', () => {
		const { container } = render(
			<PriceChart
				days={days}
				tariffs={[tariff]}
				now={NOW}
				window={{ start: '2026-11-08T00:00:00.000Z', end: '2026-11-08T03:00:00.000Z' }}
			/>
		);
		const img = screen.getByRole('img');
		expect(img.getAttribute('aria-label')).toMatch(/lowest 1,50 kr at 00:00.*highest/i);
		expect(container.querySelectorAll('rect[data-plan]')).toHaveLength(3);
		expect(container.querySelectorAll('rect[data-now]')).toHaveLength(1);
		expect(container.querySelectorAll('rect')).toHaveLength(48);
	});

	it('shows the current hour, the low and the high as text', () => {
		render(<PriceChart days={days} tariffs={[tariff]} now={NOW} window={null} />);
		// 10:30Z is 11:00 local; spot 0.5 + 0.11 ex VAT, + tax 0.4 + markup 0.1 + transfer 0.2 → 1.31 × 1.25.
		expect(screen.getByTestId('price-readout')).toHaveTextContent('Now 11:00 1,64 kr/kWh');
		expect(screen.getByTestId('price-range')).toHaveTextContent('Today 1,50–1,79 kr · cheapest 00:00');
	});

	it('shows the price of a tapped hour and labels hours under the bars', () => {
		const { container } = render(<PriceChart days={days} tariffs={[tariff]} now={NOW} window={null} />);
		fireEvent.click(container.querySelectorAll('rect')[30]!);
		expect(screen.getByTestId('price-readout')).toHaveTextContent('Tomorrow 06:00 2,20 kr/kWh');
		const ticks = [...container.querySelectorAll('text')].map(t => t.textContent);
		expect(ticks).toEqual(expect.arrayContaining(['00', '06', '12', '18']));
	});

	it('says when tomorrow is not published yet', () => {
		render(<PriceChart days={{ '2026-11-07': days['2026-11-07']! }} tariffs={[tariff]} now={NOW} window={null} />);
		expect(screen.getByText(/tomorrow.*13:00/i)).toBeInTheDocument();
	});

	it('says so when there are no prices', () => {
		render(<PriceChart days={{}} tariffs={[tariff]} now={NOW} window={null} />);
		expect(screen.getByText('No prices yet')).toBeInTheDocument();
	});
});
