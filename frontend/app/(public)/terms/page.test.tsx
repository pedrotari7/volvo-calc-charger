import { render, screen } from '@testing-library/react';
import TermsPage from './page';

describe('terms page', () => {
	it('renders headings and the required commitments', () => {
		const { container } = render(<TermsPage />);

		expect(screen.getByRole('heading', { level: 1, name: /terms/i })).toBeInTheDocument();
		expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(3);

		const text = container.textContent ?? '';
		for (const needle of [
			'lock',
			'climate',
			'never unlocks',
			'europe-west1',
			'Volvo ID',
			'estimates',
			'pedrotari7@gmail.com',
		]) {
			expect(text).toContain(needle);
		}
	});
});
