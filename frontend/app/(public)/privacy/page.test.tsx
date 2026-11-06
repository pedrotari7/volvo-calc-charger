import { render, screen } from '@testing-library/react';
import PrivacyPage from './page';

describe('privacy page', () => {
	it('lists data read, storage, retention, revocation and deletion', () => {
		const { container } = render(<PrivacyPage />);

		expect(screen.getByRole('heading', { level: 1, name: /privacy/i })).toBeInTheDocument();
		const text = container.textContent ?? '';
		for (const needle of ['europe-west1', 'until you disconnect', 'Volvo ID', 'delete', 'pedrotari7@gmail.com']) {
			expect(text).toContain(needle);
		}
	});
});
