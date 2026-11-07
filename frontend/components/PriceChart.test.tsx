import { render, screen } from '@testing-library/react';
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

	it('says so when there are no prices', () => {
		render(<PriceChart days={{}} tariffs={[tariff]} now={NOW} window={null} />);
		expect(screen.getByText('No prices yet')).toBeInTheDocument();
	});
});
